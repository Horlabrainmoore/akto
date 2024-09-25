package com.akto.utils.jobs;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.bson.conversions.Bson;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.akto.dao.ApiInfoDao;
import com.akto.dao.SampleDataDao;
import com.akto.dao.SensitiveSampleDataDao;
import com.akto.dao.SingleTypeInfoDao;
import com.akto.dao.context.Context;
import com.akto.dao.monitoring.FilterYamlTemplateDao;
import com.akto.dto.Account;
import com.akto.dto.ApiCollection;
import com.akto.dto.HttpResponseParams;
import com.akto.dto.monitoring.FilterConfig;
import com.akto.dto.monitoring.FilterConfig.FILTER_TYPE;
import com.akto.dto.test_editor.ExecutorNode;
import com.akto.dto.test_editor.YamlTemplate;
import com.akto.dto.traffic.Key;
import com.akto.dto.traffic.SampleData;
import com.akto.dto.type.SingleTypeInfo;
import com.akto.dto.type.URLMethods;
import com.akto.dto.type.URLMethods.Method;
import com.akto.log.LoggerMaker;
import com.akto.log.LoggerMaker.LogDb;
import com.akto.parsers.HttpCallParser;
import com.akto.test_editor.execution.ParseAndExecute;
import com.akto.util.AccountTask;
import com.akto.util.Pair;
import com.mongodb.BasicDBObject;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Sorts;

import static com.akto.utils.Utils.deleteApis;
import static com.akto.runtime.utils.Utils.createRegexPatternFromList;

public class CleanInventory {

    private static final LoggerMaker loggerMaker = new LoggerMaker(CleanInventory.class, LogDb.DASHBOARD);
    private static final Logger logger = LoggerFactory.getLogger(CleanInventory.class);

    final static ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1);

    public static void cleanInventoryJobRunner() {

        scheduler.scheduleAtFixedRate(new Runnable() {
            public void run() {

                int now = Context.now();
                logger.info("Starting cleanInventoryJob for all accounts at " + now);

                AccountTask.instance.executeTask(new Consumer<Account>() {
                    @Override
                    public void accept(Account t) {
                        try {
                            cleanInventoryJob();
                        } catch (Exception e) {
                            loggerMaker.errorAndAddToDb(e, "Error in cleanInventoryJob");
                        }
                    }
                }, "clean-inventory-job");

                int now2 = Context.now();
                int diffNow = now2-now;
                logger.info(String.format("Completed cleanInventoryJob for all accounts at %d , time taken : %d", now2, diffNow));
            }
        }, 0, 5, TimeUnit.HOURS);

    }

    private static Set<String> methodSet = new HashSet<>();

    private static Set<String> getMethodSet() {

        if (!methodSet.isEmpty()) {
            return methodSet;
        }

        List<String> lowerCaseMethods = Arrays.asList(URLMethods.Method.getValuesArray()).stream()
                .map(s -> s.name().toLowerCase()).collect(Collectors.toList());
        List<String> upperCaseMethods = Arrays.asList(URLMethods.Method.getValuesArray()).stream()
                .map(s -> s.name().toUpperCase()).collect(Collectors.toList());
        methodSet.addAll(upperCaseMethods);
        methodSet.addAll(lowerCaseMethods);
        return methodSet;
    }

    private static void cleanInventoryJob() {

        int now = Context.now();
        SingleTypeInfoDao.instance.deleteAll(Filters.nin(SingleTypeInfo._METHOD, getMethodSet()));
        SensitiveSampleDataDao.instance.deleteAll(Filters.nin("_id.method", getMethodSet()));
        /*
         * The above collections implement method as String, thus cleaning them.
         * Rest of the collections implement method as an ENUM,
         * thus they will not have any non-standard method.
         * Any non-standard method will be in the form of "OTHER". Thus ignoring them.
         */

        int now2 = Context.now();
        int diff = now2 - now;

        if (diff >= 2) {
            loggerMaker.infoAndAddToDb(String.format("cleanInventoryJob finished, time taken: %d ", diff));
        }

    }
    
    public static void cleanFilteredSampleDataFromAdvancedFilters(List<ApiCollection> apiCollections, List<YamlTemplate> yamlTemplates, List<String> redundantUrlList, String filePath, boolean shouldDeleteRequest, boolean saveLogsToDB) throws IOException{

        Map<Integer, ApiCollection> apiCollectionMap = apiCollections.stream().collect(Collectors.toMap(ApiCollection::getId, Function.identity()));
        // BufferedWriter writer = new BufferedWriter(new FileWriter(new File(filePath)));
        List<SampleData> sampleDataList = new ArrayList<>();
        Bson filters = Filters.empty();
        int skip = 0;
        int limit = 100;
        Bson sort = Sorts.ascending("_id.apiCollectionId", "_id.url", "_id.method");

        Map<String,FilterConfig> filterMap = FilterYamlTemplateDao.instance.fetchFilterConfig(false, yamlTemplates, true);
        Pattern pattern = createRegexPatternFromList(redundantUrlList);
        do {
            sampleDataList = SampleDataDao.instance.findAll(filters, skip, limit, sort);
            skip += limit;
            List<Key> toBeDeleted = new ArrayList<>();
            List<Key> toMove = new ArrayList<>();
            for(SampleData sampleData: sampleDataList) {
                try {
                    List<String> samples = sampleData.getSamples();
                    if (samples == null || samples.isEmpty()) {
                        logger.info("[BadApisRemover] No samples found for : " + sampleData.getId());
                        continue;
                    }

                    ApiCollection apiCollection = apiCollectionMap.get(sampleData.getId().getApiCollectionId());
                    if (apiCollection == null) {
                        logger.info("[BadApisRemover] No apiCollection found for : " + sampleData.getId());
                        continue;
                    }

                    
                    boolean isRedundant = false;
                    boolean isAllowedFromTemplate = false;
                    boolean isNetsparkerPresent = false;
                    boolean movingApi = false;
                    for (String sample : samples) {
                        HttpResponseParams httpResponseParams = HttpCallParser.parseKafkaMessage(sample);
                        isNetsparkerPresent |= sample.toLowerCase().contains("netsparker");
                        if(httpResponseParams != null){
                            isRedundant =  HttpCallParser.isRedundantEndpoint(httpResponseParams.getRequestParams().getURL(), pattern);
                            if(!isRedundant){
                                Map<String, List<ExecutorNode>> executorNodesMap = ParseAndExecute.createExecutorNodeMap(filterMap);
                                Pair<HttpResponseParams,FILTER_TYPE> temp = HttpCallParser.applyAdvancedFilters(httpResponseParams, executorNodesMap, filterMap);
                                HttpResponseParams param = temp.getFirst();
                                FILTER_TYPE filterType = temp.getSecond();

                                if(param != null){
                                    if(filterType.equals(FILTER_TYPE.MODIFIED)){
                                        movingApi = true;
                                    }else if(filterType.equals(FILTER_TYPE.ALLOWED) || filterType.equals(FILTER_TYPE.UNCHANGED)){
                                        isAllowedFromTemplate = true;
                                    }
                                }
                            }
                        }
                    }

                    if(movingApi){
                        toMove.add(sampleData.getId());
                        if(saveLogsToDB){
                            loggerMaker.infoAndAddToDb("Filter passed, modify sample data of API: " + sampleData.getId(), LogDb.DASHBOARD);
                        }else{
                            logger.info("[BadApisUpdater] Updating bad from template API: " + sampleData.getId(), LogDb.DASHBOARD);
                        }
                    }

                    else if (isRedundant || !isAllowedFromTemplate) {                                
                        // writer.write(sampleData.toString());
                        toBeDeleted.add(sampleData.getId());  
                        if(saveLogsToDB){
                            loggerMaker.infoAndAddToDb(
                                "Filter passed, deleting bad api found from filter: " + sampleData.getId(), LogDb.DASHBOARD
                            );
                        }else{
                            logger.info("[BadApisRemover] " + isNetsparkerPresent + " Deleting bad API from template: " + sampleData.getId(), LogDb.DASHBOARD);
                        }           
                    } else {
                        if(saveLogsToDB){
                            loggerMaker.infoAndAddToDb(
                                "Filter did not pass, keeping api found from filter: " + sampleData.getId(), LogDb.DASHBOARD
                            );
                        }else{
                            logger.info("[BadApisRemover] " + isNetsparkerPresent + " Keeping API from template: " + sampleData.getId(), LogDb.DASHBOARD);
                        } 
                        
                    }
                } catch (Exception e) {
                    loggerMaker.errorAndAddToDb("[BadApisRemover] Couldn't delete an api for default payload: " + sampleData.getId() + e.getMessage(), LogDb.DASHBOARD);
                }
            }
            if (shouldDeleteRequest) {
                logger.info("starting deletion of apis");
                deleteApis(toBeDeleted);
            }

            // String shouldMove = System.getenv("MOVE_REDUNDANT_APIS");

        } while (!sampleDataList.isEmpty());

        // writer.flush();
        // writer.close();
    }

    public static void removeUnnecessaryEndpoints(List<ApiCollection> apiCollections,  boolean shouldDeleteRequest){
        try {
            for (ApiCollection apiCollection: apiCollections) {
                List<Key> toBeDeleted = new ArrayList<>();
                if (apiCollection.getHostName() == null) {
                    continue;
                }
                List<BasicDBObject> endpoints = com.akto.action.observe.Utils.fetchEndpointsInCollectionUsingHost(apiCollection.getId(), 0);

                if (endpoints == null || endpoints.isEmpty()) {
                    continue;
                }

                logger.info("[BadApisRemover] Starting for APICollection: " + apiCollection.getId(), LogDb.DASHBOARD);
                for (BasicDBObject singleTypeInfo: endpoints) {
                    singleTypeInfo = (BasicDBObject) (singleTypeInfo.getOrDefault("_id", new BasicDBObject()));
                    int apiCollectionId = singleTypeInfo.getInt("apiCollectionId");
                    String url = singleTypeInfo.getString("url");
                    String method = singleTypeInfo.getString("method");

                    Key key = new Key(apiCollectionId, url, Method.fromString(method), -1, 0, 0);

                    if (method.equalsIgnoreCase("options")) {
                        logger.info("[BadApisRemover] OPTIONS Deleting bad API: " + key, LogDb.DASHBOARD);
                        toBeDeleted.add(key);
                        continue;
                    }

                    if (!method.equalsIgnoreCase("get")) {
                        logger.info("[BadApisRemover] Non-get Deleting bad API: " + key, LogDb.DASHBOARD);
                        continue;
                    }

                    Bson filter = ApiInfoDao.getFilter(url, method, apiCollectionId);
        
                    SampleData sampleData = SampleDataDao.instance.findOne(filter);
                    if (sampleData == null || sampleData.getSamples() == null || sampleData.getSamples().isEmpty()) {
                        Bson stiFilterReq = Filters.and(
                            Filters.eq("url", url),
                            Filters.eq("method", method),
                            Filters.in("responseCode", new Integer[]{-1, 200, 201, 204, 302}),
                            Filters.eq("isHeader", false),
                            Filters.or(Filters.eq("isUrlParam", false), Filters.exists("isUrlParam", false)), 
                            Filters.eq("apiCollectionId", apiCollectionId)
                        );
                        SingleTypeInfo singleTypeInfoForApi = SingleTypeInfoDao.instance.findOne(stiFilterReq);
                        if (singleTypeInfoForApi == null) {
                            logger.info("[BadApisRemover] no-sample Deleting bad API: " + key, LogDb.DASHBOARD);
                            toBeDeleted.add(key);    
                        } else {
                            logger.info("[BadApisRemover] yes-sti Deleting bad API: " + key + " " + singleTypeInfoForApi.composeKey(), LogDb.DASHBOARD);
                        }
                    } else {
                        logger.info("[BadApisRemover] yes-sample Deleting bad API: " + key, LogDb.DASHBOARD);
                    }
                }

                
                if (shouldDeleteRequest) {
                    logger.info("starting deletion of apis");
                    deleteApis(toBeDeleted);
                }
            }

        } catch (Exception e) {
            loggerMaker.errorAndAddToDb("Couldn't complete scan for APIs remover: " + e.getMessage(), LogDb.DASHBOARD);
            e.printStackTrace();
        }
    }

}