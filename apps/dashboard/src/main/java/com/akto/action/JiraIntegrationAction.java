package com.akto.action;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import org.apache.commons.io.FileUtils;

import com.akto.dao.JiraIntegrationDao;
import com.akto.dao.context.Context;
import com.akto.dao.testing_run_findings.TestingRunIssuesDao;
import com.akto.dto.HttpResponseParams;
import com.akto.dto.OriginalHttpRequest;
import com.akto.dto.OriginalHttpResponse;
import com.akto.dto.jira_integration.JiraIntegration;
import com.akto.dto.jira_integration.JiraMetaData;
import com.akto.log.LoggerMaker;
import com.akto.log.LoggerMaker.LogDb;
import com.akto.parsers.HttpCallParser;
import com.akto.testing.ApiExecutor;
import com.akto.util.Constants;
import com.akto.util.http_util.CoreHTTPClient;
import com.mongodb.BasicDBList;
import com.mongodb.BasicDBObject;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.UpdateOptions;
import com.mongodb.client.model.Updates;
import com.opensymphony.xwork2.Action;

import okhttp3.Call;
import okhttp3.MediaType;
import okhttp3.MultipartBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class JiraIntegrationAction extends UserAction {

    private String baseUrl;
    private String projId;
    private String userEmail;
    private String apiToken;
    private String issueType;
    private JiraIntegration jiraIntegration;
    private JiraMetaData jiraMetaData;

    private String jiraTicketKey;

    private String origReq;
    private String testReq;
    private String issueId;

    private Map<String,List<BasicDBObject>> projectAndIssueMap;

    private final String META_ENDPOINT = "/rest/api/3/issue/createmeta";
    private final String CREATE_ISSUE_ENDPOINT = "/rest/api/3/issue";
    private final String ATTACH_FILE_ENDPOINT = "/attachments";
    private static final LoggerMaker loggerMaker = new LoggerMaker(ApiExecutor.class);
    private static final OkHttpClient client = CoreHTTPClient.client.newBuilder()
            .connectTimeout(60, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .build();

    public String testIntegration() {

        String url = baseUrl + META_ENDPOINT;
        String authHeader = Base64.getEncoder().encodeToString((userEmail + ":" + apiToken).getBytes());
        try {

            Request.Builder builder = new Request.Builder();
            builder.addHeader("Authorization", "Basic " + authHeader);
            builder = builder.url(url);
            Request okHttpRequest = builder.build();
            Call call = client.newCall(okHttpRequest);
            Response response = null;
            String responsePayload = null;
            try {
                response = call.execute();
                responsePayload = response.body().string();
                loggerMaker.errorAndAddToDb("error while testing jira integration, received null response", LoggerMaker.LogDb.DASHBOARD);
                if (responsePayload == null) {
                    addActionError("Error while testing jira integration, received null response");
                    return Action.ERROR.toUpperCase();
                }
            } catch (Exception e) {
                addActionError("Error while testing jira integration, error making call\"");
                loggerMaker.errorAndAddToDb("error while testing jira integration, error making call" + e.getMessage(), LoggerMaker.LogDb.DASHBOARD);
                return Action.ERROR.toUpperCase();
            } finally {
                if (response != null) {
                    response.close();
                }
            }
            BasicDBObject payloadObj;
            setProjId(projId.trim());
            Set<String> inputProjectIds = new HashSet(Arrays.asList(this.projId.split(",")));
            this.projectAndIssueMap = new HashMap<>();
            try {
                payloadObj =  BasicDBObject.parse(responsePayload);
                BasicDBList projects = (BasicDBList) payloadObj.get("projects");
                for (Object projObj: projects) {
                    BasicDBObject obj = (BasicDBObject) projObj;
                    String key = obj.getString("key");
                    if (!inputProjectIds.contains(key)) {
                        continue;
                    }
                    loggerMaker.infoAndAddToDb("evaluating issuetype for project key " + key + ", project json obj " + obj, LoggerMaker.LogDb.DASHBOARD);
                    BasicDBList issueTypes = (BasicDBList) obj.get("issuetypes");
                    List<BasicDBObject> issueIdPairs = getIssueTypesWithIds(issueTypes);
                    this.projectAndIssueMap.put(key, issueIdPairs);
                }
                if (this.projectAndIssueMap.isEmpty()) {
                    addActionError("Error while testing jira integration, unable to resolve issue type id");
                    loggerMaker.errorAndAddToDb("Error while testing jira integration, unable to resolve issue type id", LoggerMaker.LogDb.DASHBOARD);
                    return Action.ERROR.toUpperCase();
                }
            } catch(Exception e) {
                return Action.ERROR.toUpperCase();
            }
        } catch (Exception e) {
            addActionError("Error while testing jira integration");
            loggerMaker.errorAndAddToDb("error while testing jira integration, " + e, LoggerMaker.LogDb.DASHBOARD);
            return Action.ERROR.toUpperCase();
        }

        return Action.SUCCESS.toUpperCase();
    }

    private List<BasicDBObject> getIssueTypesWithIds(BasicDBList issueTypes) {

        List<BasicDBObject> idPairs = new ArrayList<>();
        for (Object issueObj: issueTypes) {
            BasicDBObject obj2 = (BasicDBObject) issueObj;
            String issueName = obj2.getString("name");
            String issueId = obj2.getString("id");
            BasicDBObject finalObj = new BasicDBObject();
            finalObj.put("issueId", issueId);
            finalObj.put("issueType", issueName);
            idPairs.add(finalObj);
        }
        return idPairs;
    }

    public String addIntegration() {

        UpdateOptions updateOptions = new UpdateOptions();
        updateOptions.upsert(true);

        JiraIntegrationDao.instance.getMCollection().updateOne(
                new BasicDBObject(),
                Updates.combine(
                        Updates.set("baseUrl", baseUrl),
                        Updates.set("projId", projId),
                        Updates.set("userEmail", userEmail),
                        Updates.set("apiToken", apiToken),
                        Updates.set("issueType", issueType),
                        Updates.setOnInsert("createdTs", Context.now()),
                        Updates.set("updatedTs", Context.now()),
                        Updates.set("projectIdsMap", projectAndIssueMap)
                ),
                updateOptions
        );

        return Action.SUCCESS.toUpperCase();
    }

    public String fetchIntegration() {
        jiraIntegration = JiraIntegrationDao.instance.findOne(new BasicDBObject());
        if(jiraIntegration != null){
            jiraIntegration.setApiToken("****************************");
        }
        return Action.SUCCESS.toUpperCase();
    }

    public String createIssue() {

        BasicDBObject reqPayload = new BasicDBObject();
        BasicDBObject fields = new BasicDBObject();

        // issue title
        fields.put("summary", "Akto Report - " + jiraMetaData.getIssueTitle());
        jiraIntegration = JiraIntegrationDao.instance.findOne(new BasicDBObject());

        // issue type (TASK)
        BasicDBObject issueTypeObj = new BasicDBObject();
        issueTypeObj.put("id", this.issueType);
        fields.put("issuetype", issueTypeObj);

        // project id
        BasicDBObject project = new BasicDBObject();
        project.put("key", this.projId);
        fields.put("project", project);

        // issue description
        BasicDBObject description = new BasicDBObject();
        description.put("type", "doc");
        description.put("version", 1);
        BasicDBList contentList = new BasicDBList();
        contentList.add(buildContentDetails(jiraMetaData.getHostStr(), null));
        contentList.add(buildContentDetails(jiraMetaData.getEndPointStr(), null));
        contentList.add(buildContentDetails("Issue link - Akto dashboard", jiraMetaData.getIssueUrl()));
        contentList.add(buildContentDetails(jiraMetaData.getIssueDescription(), null));
        description.put("content", contentList);

        fields.put("description", description);

        reqPayload.put("fields", fields);

        String url = jiraIntegration.getBaseUrl() + CREATE_ISSUE_ENDPOINT;
        String authHeader = Base64.getEncoder().encodeToString((jiraIntegration.getUserEmail() + ":" + jiraIntegration.getApiToken()).getBytes());

        String jiraTicketUrl = "";
        Map<String, List<String>> headers = new HashMap<>();
        headers.put("Authorization", Collections.singletonList("Basic " + authHeader));
        OriginalHttpRequest request = new OriginalHttpRequest(url, "", "POST", reqPayload.toString(), headers, "");
        try {
            OriginalHttpResponse response = ApiExecutor.sendRequest(request, true, null, false, new ArrayList<>());
            String responsePayload = response.getBody();
            if (response.getStatusCode() > 201 || responsePayload == null) {
                loggerMaker.errorAndAddToDb("error while creating jira issue, url not accessible, requestbody " + request.getBody() + " ,responsebody " + response.getBody() + " ,responsestatus " + response.getStatusCode(), LoggerMaker.LogDb.DASHBOARD);
                if (responsePayload != null) {
                    try {
                        BasicDBObject obj = BasicDBObject.parse(responsePayload);
                        List<String> errorMessages = (List) obj.get("errorMessages");
                        String error;
                        if (errorMessages.size() == 0) {
                            BasicDBObject errObj = BasicDBObject.parse(obj.getString("errors"));
                            error = errObj.getString("project");
                        } else {
                            error = errorMessages.get(0);
                        }
                        addActionError(error);
                    } catch (Exception e) {
                        // TODO: handle exception
                    }
                }
                return Action.ERROR.toUpperCase();
            }
            BasicDBObject payloadObj;
            try {
                payloadObj =  BasicDBObject.parse(responsePayload);
                this.jiraTicketKey = payloadObj.getString("key");
                jiraTicketUrl = jiraIntegration.getBaseUrl() + "/browse/" + this.jiraTicketKey;
            } catch(Exception e) {
                loggerMaker.errorAndAddToDb(e, "error making jira issue url " + e.getMessage(), LoggerMaker.LogDb.DASHBOARD);
                return Action.ERROR.toUpperCase();
            }
        } catch(Exception e) {
            return Action.ERROR.toUpperCase();
        }

        UpdateOptions updateOptions = new UpdateOptions();
        updateOptions.upsert(false);

        if(jiraTicketUrl.length() > 0){
            TestingRunIssuesDao.instance.getMCollection().updateOne(
                Filters.eq(Constants.ID, jiraMetaData.getTestingIssueId()),
                Updates.combine(
                        Updates.set("jiraIssueUrl", jiraTicketUrl)
                ),
                updateOptions
            );
        }
        return Action.SUCCESS.toUpperCase();
    }

    public String attachFileToIssue() {

        String origCurl, testCurl;

        try {
            jiraIntegration = JiraIntegrationDao.instance.findOne(new BasicDBObject());
            String url = jiraIntegration.getBaseUrl() + CREATE_ISSUE_ENDPOINT + "/" + issueId + ATTACH_FILE_ENDPOINT;
            String authHeader = Base64.getEncoder().encodeToString((jiraIntegration.getUserEmail() + ":" + jiraIntegration.getApiToken()).getBytes());

            origCurl = ExportSampleDataAction.getCurl(origReq);
            testCurl = ExportSampleDataAction.getCurl(testReq);
            HttpResponseParams origObj = HttpCallParser.parseKafkaMessage(origReq);
            BasicDBObject respObj = BasicDBObject.parse(testReq);
            BasicDBObject respPayloaObj = BasicDBObject.parse(respObj.getString("response"));
            String resp = respPayloaObj.getString("body");

            File tmpOutputFile = File.createTempFile("output", ".txt");

            FileUtils.writeStringToFile(new File(tmpOutputFile.getPath()), "Original Curl ----- \n\n", (String) null);
            FileUtils.writeStringToFile(new File(tmpOutputFile.getPath()), origCurl + "\n\n", (String) null, true);
            FileUtils.writeStringToFile(new File(tmpOutputFile.getPath()), "Original Api Response ----- \n\n", (String) null, true);
            FileUtils.writeStringToFile(new File(tmpOutputFile.getPath()), origObj.getPayload() + "\n\n", (String) null, true);

            FileUtils.writeStringToFile(new File(tmpOutputFile.getPath()), "Test Curl ----- \n\n", (String) null, true);
            FileUtils.writeStringToFile(new File(tmpOutputFile.getPath()), testCurl + "\n\n", (String) null, true);
            FileUtils.writeStringToFile(new File(tmpOutputFile.getPath()), "Test Api Response ----- \n\n", (String) null, true);
            FileUtils.writeStringToFile(new File(tmpOutputFile.getPath()), resp + "\n\n", (String) null, true);


            MediaType mType = MediaType.parse("application/octet-stream");
            RequestBody requestBody = new MultipartBody.Builder().setType(MultipartBody.FORM)
                    .addFormDataPart("file", tmpOutputFile.getName(),
                            RequestBody.create(tmpOutputFile, mType))
                    .build();

            Request request = new Request.Builder()
                    .url(url)
                    .post(requestBody)
                    .header("Authorization", "Basic " + authHeader)
                    .header("X-Atlassian-Token", "nocheck")
                    .build();

            Response response = null;

            try {
                response = client.newCall(request).execute();
            } catch (Exception ex) {
                loggerMaker.errorAndAddToDb(ex,
                        String.format("Failed to call jira from url %s. Error %s", url, ex.getMessage()),
                        LogDb.DASHBOARD);
            } finally {
                if (response != null) {
                    response.close();
                }
            }

        } catch (Exception ex) {
                ex.printStackTrace();
        }
        

        return Action.SUCCESS.toUpperCase();
    }

    private BasicDBObject buildContentDetails(String txt, String link) {
        BasicDBObject details = new BasicDBObject();
        details.put("type", "paragraph");
        BasicDBList contentInnerList = new BasicDBList();
        BasicDBObject innerDetails = new BasicDBObject();
        innerDetails.put("text", txt);
        innerDetails.put("type", "text");

        if (link != null) {
            BasicDBList marksList = new BasicDBList();
            BasicDBObject marks = new BasicDBObject();
            marks.put("type", "link");
            BasicDBObject attrs = new BasicDBObject();
            attrs.put("href", link);
            marks.put("attrs", attrs);
            marksList.add(marks);
            innerDetails.put("marks", marksList);
        }

        contentInnerList.add(innerDetails);
        details.put("content", contentInnerList);


        return details;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getProjId() {
        return projId;
    }

    public void setProjId(String projId) {
        this.projId = projId;
    }

    public String getUserEmail() {
        return userEmail;
    }

    public void setUserEmail(String userEmail) {
        this.userEmail = userEmail;
    }

    public void setApiToken(String apiToken) {
        this.apiToken = apiToken;
    }

    public String getIssueType() {
        return issueType;
    }

    public void setIssueType(String issueType) {
        this.issueType = issueType;
    }
    
    public JiraIntegration getJiraIntegration() {
        return jiraIntegration;
    }

    public void setJiraIntegration(JiraIntegration jiraIntegration) {
        this.jiraIntegration = jiraIntegration;
    }

    public String getOrigReq() {
        return origReq;
    }

    public void setOrigReq(String origReq) {
        this.origReq = origReq;
    }

    public String getTestReq() {
        return testReq;
    }

    public void setTestReq(String testReq) {
        this.testReq = testReq;
    }

    public String getIssueId() {
        return issueId;
    }

    public void setIssueId(String issueId) {
        this.issueId = issueId;
    }

    public Map<String, List<BasicDBObject>> getProjectAndIssueMap() {
        return projectAndIssueMap;
    }

    public void setProjectAndIssueMap(Map<String, List<BasicDBObject>> projectAndIssueMap) {
        this.projectAndIssueMap = projectAndIssueMap;
    }

    public JiraMetaData getJiraMetaData() {
        return jiraMetaData;
    }

    public void setJiraMetaData(JiraMetaData jiraMetaData) {
        this.jiraMetaData = jiraMetaData;
    }

    public String getJiraTicketKey() {
        return jiraTicketKey;
    }

    public void setJiraTicketKey(String jiraTicketKey) {
        this.jiraTicketKey = jiraTicketKey;
    }
    
}
