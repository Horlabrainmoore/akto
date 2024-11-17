import PageWithMultipleCards from "../../../components/layouts/PageWithMultipleCards"
import { Text, Button, IndexFiltersMode, Box, Badge, Popover, ActionList, InlineStack, Icon} from "@shopify/polaris"
import { HideIcon, ViewIcon, FileIcon, CheckCircleIcon } from "@shopify/polaris-icons";
import api from "../api"
import { useEffect,useState, useRef } from "react"
import func from "@/util/func"
import GithubSimpleTable from "@/apps/dashboard/components/tables/GithubSimpleTable";
import ObserveStore from "../observeStore"
import PersistStore from "../../../../main/PersistStore"
import transform from "../transform"
import SpinnerCentered from "@/apps/dashboard/components/progress/SpinnerCentered"
import { CellType } from "@/apps/dashboard/components/tables/rows/GithubRow"
import CreateNewCollectionModal from "./CreateNewCollectionModal"
import TooltipText from "@/apps/dashboard/components/shared/TooltipText"
import SummaryCardInfo from "@/apps/dashboard/components/shared/SummaryCardInfo"
import collectionApi from "./api"
import CollectionsPageBanner from "./component/CollectionsPageBanner"
import useTable from "@/apps/dashboard/components/tables/TableContext"
import TitleWithInfo from "@/apps/dashboard/components/shared/TitleWithInfo"
import HeadingWithTooltip from "../../../components/shared/HeadingWithTooltip"
import { saveAs } from 'file-saver'
// import dummyJson from "../../../components/shared/treeView/dummyJson"
import TreeViewTable from "../../../components/shared/treeView/TreeViewTable"
import TableStore from "../../../components/tables/TableStore";
import { useNavigate } from "react-router-dom";


const headers = [
    {
        title: "API collection name",
        text: "API collection name",
        value: "displayNameComp",
        filterKey: "displayName",
        textValue: 'displayName',
        showFilter: true
    },
    {
        title: "Total endpoints",
        text: "Total endpoints",
        value: "urlsCount",
        isText: CellType.TEXT,
        sortActive: true,
        mergeType: (a, b) => {
            return (a || 0) + (b || 0);
        },
        shouldMerge: true,
        boxWidth: '80px'
    },
    {
        title: <HeadingWithTooltip content={<Text variant="bodySm">Risk score of collection is maximum risk score of the endpoints inside this collection</Text>} title="Risk score" />,
        value: 'riskScoreComp',
        textValue: 'riskScore',
        numericValue: 'riskScore',
        text: 'Risk Score',
        sortActive: true,
        mergeType: (a, b) => {
            return Math.max(a || 0, b || 0);
        },
        shouldMerge: true,
        boxWidth: '80px'
    },
    {   
        title: 'Test coverage',
        text: 'Test coverage', 
        value: 'coverage',
        isText: CellType.TEXT,
        tooltipContent: (<Text variant="bodySm">Percentage of endpoints tested successfully in the collection</Text>),
        mergeType: (a, b) => {
            return (a || 0) + (b || 0);
        },
        numericValue: 'testedEndpoints',
        shouldMerge: true,
        boxWidth: '80px'
    },
    {
        title: 'Issues', 
        text: 'Issues', 
        value: 'issuesArr',
        numericValue: 'severityInfo',
        textValue: 'issuesArrVal',
        tooltipContent: (<Text variant="bodySm">Severity and count of issues present in the collection</Text>),
        mergeType: (a, b) => {
            return {
                HIGH: ((a?.HIGH || 0) + (b?.HIGH || 0)),
                MEDIUM: ((a?.MEDIUM || 0) + (b?.MEDIUM || 0)),
                LOW: ((a?.LOW || 0) + (b?.LOW || 0)),
            };
        },
        shouldMerge: true,
        boxWidth: '100px'
    },
    {   
        title: 'Sensitive data',
        text: 'Sensitive data',
        value: 'sensitiveSubTypes',
        numericValue: 'sensitiveInRespTypes',
        textValue: 'sensitiveSubTypesVal',
        tooltipContent: (<Text variant="bodySm">Types of data type present in response of endpoint inside the collection</Text>),
        mergeType: (a, b) => {
            return [...new Set([...(a || []), ...(b || [])])];
        },
        shouldMerge: true,
        boxWidth: '160px'
    },
    {
        text: 'Collection type',
        title: 'Collection type',
        value: 'envTypeComp',
        filterKey: "envType",
        showFilter: true,
        textValue: 'envType',
        tooltipContent: (<Text variant="bodySm">Environment type for an API collection, Staging or Production </Text>),
    },
    {   
        title: <HeadingWithTooltip content={<Text variant="bodySm">The most recent time an endpoint within collection was either discovered for the first time or seen again</Text>} title="Last traffic seen" />, 
        text: 'Last traffic seen', 
        value: 'lastTraffic',
        numericValue: 'detectedTimestamp',
        isText: CellType.TEXT,
        sortActive: true,
        mergeType: (a, b) => {
            return Math.max(a || 0, b || 0);
        },
        shouldMerge: true,
        boxWidth: '80px'
    },
    {
        title: <HeadingWithTooltip content={<Text variant="bodySm">Time when collection was created</Text>} title="Discovered" />,
        text: 'Discovered',
        value: 'discovered',
        isText: CellType.TEXT,
        sortActive: true,
    }
];


const sortOptions = [
    { label: 'Endpoints', value: 'urlsCount asc', directionLabel: 'More', sortKey: 'urlsCount', columnIndex: 2 },
    { label: 'Endpoints', value: 'urlsCount desc', directionLabel: 'Less', sortKey: 'urlsCount' , columnIndex: 2},
    { label: 'Name', value: 'displayName asc', directionLabel: 'A-Z', sortKey: 'displayName' },
    { label: 'Name', value: 'displayName desc', directionLabel: 'Z-A', sortKey: 'displayName' },
    { label: 'Activity', value: 'deactivatedScore asc', directionLabel: 'Active', sortKey: 'deactivatedRiskScore' },
    { label: 'Activity', value: 'deactivatedScore desc', directionLabel: 'Inactive', sortKey: 'activatedRiskScore' },
    { label: 'Risk Score', value: 'score asc', directionLabel: 'High risk', sortKey: 'riskScore', columnIndex: 3 },
    { label: 'Risk Score', value: 'score desc', directionLabel: 'Low risk', sortKey: 'riskScore' , columnIndex: 3},
    { label: 'Discovered', value: 'discovered asc', directionLabel: 'Recent first', sortKey: 'startTs', columnIndex: 9 },
    { label: 'Discovered', value: 'discovered desc', directionLabel: 'Oldest first', sortKey: 'startTs' , columnIndex: 9},
    { label: 'Last traffic seen', value: 'detected asc', directionLabel: 'Recent first', sortKey: 'detectedTimestamp', columnIndex: 8 },
    { label: 'Last traffic seen', value: 'detected desc', directionLabel: 'Oldest first', sortKey: 'detectedTimestamp' , columnIndex: 8},
  ];        


const resourceName = {
    singular: 'collection',
    plural: 'collections',
  };

function convertToCollectionData(c) {
    return {
        ...c,
        detected: func.prettifyEpoch(c.startTs),
        icon: CheckCircleIcon,
        nextUrl: "/dashboard/observe/inventory/"+ c.id
    };    
}

const convertToNewData = (collectionsArr, sensitiveInfoMap, severityInfoMap, coverageMap, trafficInfoMap, riskScoreMap, isLoading) => {

    const newData = collectionsArr.map((c) => {
        if(c.deactivated){
            c.rowStatus = 'critical'
            c.disableClick = true
        }
        return{
            ...c,
            displayNameComp: (<Box maxWidth="20vw"><TooltipText tooltip={c.displayName} text={c.displayName} textProps={{fontWeight: 'medium'}}/></Box>),
            testedEndpoints: c.urlsCount === 0 ? 0 : (coverageMap[c.id] ? coverageMap[c.id] : 0),
            sensitiveInRespTypes: sensitiveInfoMap[c.id] ? sensitiveInfoMap[c.id] : [],
            severityInfo: severityInfoMap[c.id] ? severityInfoMap[c.id] : {},
            detected: func.prettifyEpoch(trafficInfoMap[c.id] || 0),
            detectedTimestamp: c.urlsCount === 0 ? 0 : (trafficInfoMap[c.id] || 0),
            riskScore: c.urlsCount === 0 ? 0 : (riskScoreMap[c.id] ? riskScoreMap[c.id] : 0),
            discovered: func.prettifyEpoch(c.startTs || 0),
        }
    })

    const prettifyData = transform.prettifyCollectionsData(newData, isLoading)
    return { prettify: prettifyData, normal: newData }
}

function ApiCollections() {

    const navigate = useNavigate();
    const [data, setData] = useState({'hostname':[]})
    const [active, setActive] = useState(false);
    const [loading, setLoading] = useState(false)
    const [selectedTab, setSelectedTab] = useState("hostname")
    const [selected, setSelected] = useState(1)
    const [summaryData, setSummaryData] = useState({totalEndpoints:0 , totalTestedEndpoints: 0, totalSensitiveEndpoints: 0, totalCriticalEndpoints: 0})
    const [hasUsageEndpoints, setHasUsageEndpoints] = useState(true)
    const [envTypeMap, setEnvTypeMap] = useState({})
    const [refreshData, setRefreshData] = useState(false)
    const [popover,setPopover] = useState(false)
    const [normalData, setNormalData] = useState([])
    const [treeView, setTreeView] = useState(false);
    const [moreActions, setMoreActions] = useState(false);

    // const dummyData = dummyJson;

    const definedTableTabs = ['All', 'Hostname', 'Groups', 'Custom', 'Deactivated']

    const { tabsInfo, selectItems } = useTable()
    const tableCountObj = func.getTabsCount(definedTableTabs, data)
    const tableTabs = func.getTableTabsContent(definedTableTabs, tableCountObj, setSelectedTab, selectedTab, tabsInfo)

    const setInventoryFlyout = ObserveStore(state => state.setInventoryFlyout)
    const setFilteredItems = ObserveStore(state => state.setFilteredItems) 
    const setSamples = ObserveStore(state => state.setSamples)
    const setSelectedUrl = ObserveStore(state => state.setSelectedUrl)

    const resetFunc = () => {
        setInventoryFlyout(false)
        setFilteredItems([])
        setSamples("")
        setSelectedUrl({})
    }

    const showCreateNewCollectionPopup = () => {
        setActive(true)
    }

    const navigateToQueryPage = () => {
        navigate("/dashboard/observe/query_mode")
    }

    const allCollections = PersistStore(state => state.allCollections)
    // const allCollections = dummyData.allCollections;
    const setAllCollections = PersistStore(state => state.setAllCollections)
    const setCollectionsMap = PersistStore(state => state.setCollectionsMap)
    const setHostNameMap = PersistStore(state => state.setHostNameMap)
    const setCoverageMap = PersistStore(state => state.setCoverageMap)

    // const lastFetchedResp = dummyData.lastFetchedResp
    // const lastFetchedSeverityResp = dummyData.lastFetchedSeverityResp
    // const lastFetchedSensitiveResp = dummyData.lastFetchedSensitiveResp
    const lastFetchedInfo = PersistStore.getState().lastFetchedInfo
    const lastFetchedResp = PersistStore.getState().lastFetchedResp
    const lastFetchedSeverityResp = PersistStore.getState().lastFetchedSeverityResp
    const lastFetchedSensitiveResp = PersistStore.getState().lastFetchedSensitiveResp
    const setLastFetchedInfo = PersistStore.getState().setLastFetchedInfo
    const setLastFetchedResp = PersistStore.getState().setLastFetchedResp
    const setLastFetchedSeverityResp = PersistStore.getState().setLastFetchedSeverityResp
    const setLastFetchedSensitiveResp = PersistStore.getState().setLastFetchedSensitiveResp

    // as riskScore cron runs every 5 min, we will cache the data and refresh in 5 mins
    // similarly call sensitive and severityInfo

    async function fetchData() {

        // first api call to get only collections name and collection id
        setLoading(true)
        const apiCollectionsResp = await api.getAllCollectionsBasic();
        setLoading(false)
        let hasUserEndpoints = await api.getUserEndpoints()
        setHasUsageEndpoints(hasUserEndpoints)
        let tmp = (apiCollectionsResp.apiCollections || []).map(convertToCollectionData)
        let dataObj = {}
        dataObj = convertToNewData(tmp, {}, {}, {}, {}, {}, true);
        let res = {}
        res.all = dataObj.prettify
        res.hostname = dataObj.prettify.filter((c) => c.hostName !== null && c.hostName !== undefined && !c.deactivated)
        res.groups = dataObj.prettify.filter((c) => c.type === "API_GROUP" && !c.deactivated)
        res.custom = res.all.filter(x => !res.hostname.includes(x) && !x.deactivated && !res.groups.includes(x));
        setData(res);
        if (res.hostname.length === 0) {
            setTimeout(() => {
                setSelectedTab("custom");
                setSelected(3);
            },[100])
        }

        let envTypeObj = {}
        tmp.forEach((c) => {
            envTypeObj[c.id] = c.envType
        })
        setEnvTypeMap(envTypeObj)
        setAllCollections(apiCollectionsResp.apiCollections || [])

        const shouldCallHeavyApis = (func.timeNow() - lastFetchedInfo.lastRiskScoreInfo) >= (5 * 60)
        // const shouldCallHeavyApis = false;

        // fire all the other apis in parallel

        let apiPromises = [
            api.getCoverageInfoForCollections(),
            api.getLastTrafficSeen(),
            collectionApi.fetchCountForHostnameDeactivatedCollections()
        ];
        if(shouldCallHeavyApis){
            apiPromises = [
                ...apiPromises,
                ...[api.getRiskScoreInfo(), api.getSensitiveInfoForCollections(), api.getSeverityInfoForCollections()]
            ]
        }
        
        let results = await Promise.allSettled(apiPromises);
        let coverageInfo = results[0].status === 'fulfilled' ? results[0].value : {};
        // let coverageInfo = dummyData.coverageMap
        let trafficInfo = results[1].status === 'fulfilled' ? results[1].value : {};
        let deactivatedCountInfo = results[2].status === 'fulfilled' ? results[2].value : {};

        let riskScoreObj = lastFetchedResp
        let sensitiveInfo = lastFetchedSensitiveResp
        let severityObj = lastFetchedSeverityResp

        if(shouldCallHeavyApis){
            if(results[3]?.status === "fulfilled"){
                const res = results[3].value
                riskScoreObj = {
                    criticalUrls: res.criticalEndpointsCount,
                    riskScoreMap: res.riskScoreOfCollectionsMap
                } 
            }

            if(results[4]?.status === "fulfilled"){
                const res = results[4].value
                sensitiveInfo ={ 
                    sensitiveUrls: res.sensitiveUrlsInResponse,
                    sensitiveInfoMap: res.sensitiveSubtypesInCollection
                }
            }

            if(results[5]?.status === "fulfilled"){
                const res = results[5].value
                severityObj = res
            }

            // update the store which has the cached response
            setLastFetchedInfo({lastRiskScoreInfo: func.timeNow(), lastSensitiveInfo: func.timeNow()})
            setLastFetchedResp(riskScoreObj)
            setLastFetchedSeverityResp(severityObj)
            setLastFetchedSensitiveResp(sensitiveInfo)

        }

        setHasUsageEndpoints(hasUserEndpoints)
        setCoverageMap(coverageInfo)

        dataObj = convertToNewData(tmp, sensitiveInfo.sensitiveInfoMap, severityObj, coverageInfo, trafficInfo, riskScoreObj?.riskScoreMap, false);
        setNormalData(dataObj.normal)

        // Separate active and deactivated collections
        const deactivatedCollections = dataObj.prettify.filter(c => c.deactivated).map((c)=>{
            if(deactivatedCountInfo.hasOwnProperty(c.id)){
                c.urlsCount = deactivatedCountInfo[c.id]
            }
            return c
        });
        
        // Calculate summary data only for active collections
        const summary = transform.getSummaryData(dataObj.normal)
        summary.totalCriticalEndpoints = riskScoreObj.criticalUrls;
        summary.totalSensitiveEndpoints = sensitiveInfo.sensitiveUrls
        setSummaryData(summary)

        setCollectionsMap(func.mapCollectionIdToName(tmp))
        const allHostNameMap = func.mapCollectionIdToHostName(tmp)
        setHostNameMap(allHostNameMap)

        tmp = {}
        tmp.all = dataObj.prettify
        tmp.hostname = dataObj.prettify.filter((c) => c.hostName !== null && c.hostName !== undefined && !c.deactivated)
        tmp.groups = dataObj.prettify.filter((c) => c.type === "API_GROUP" && !c.deactivated)
        tmp.custom = tmp.all.filter(x => !tmp.hostname.includes(x) && !x.deactivated && !tmp.groups.includes(x));
        tmp.deactivated = deactivatedCollections
        setData(tmp);
    }

    function disambiguateLabel(key, value) {
        return func.convertToDisambiguateLabelObj(value, null, 2)
    }

    useEffect(() => {
        fetchData()
        resetFunc()    
    }, [])
    const createCollectionModalActivatorRef = useRef();
    const resetResourcesSelected = () => {
        TableStore.getState().setSelectedItems([])
        selectItems([])
    }
    async function handleCollectionsAction(collectionIdList, apiFunction, toastContent){
        const collectionIdListObj = collectionIdList.map(collectionId => ({ id: collectionId.toString() }))
        await apiFunction(collectionIdListObj)
        resetResourcesSelected();
        fetchData()
        func.setToast(true, false, `${collectionIdList.length} API collection${func.addPlurality(collectionIdList.length)} ${toastContent} successfully`)
    }

    const exportCsv = (selectedResources = []) =>{
        const csvFileName = definedTableTabs[selected] + " Collections.csv"
        const selectedResourcesSet = new Set(selectedResources)
        if (!loading) {
            let headerTextToValueMap = Object.fromEntries(headers.map(x => [x.text, x.isText === CellType.TEXT ? x.value : x.textValue]).filter(x => x[0]?.length > 0));
            let csv = Object.keys(headerTextToValueMap).join(",") + "\r\n"
            data['all'].forEach(i => {
                if(selectedResources.length === 0 || selectedResourcesSet.has(i.id)){
                    csv += Object.values(headerTextToValueMap).map(h => (i[h] || "-")).join(",") + "\r\n"
                }
            })
            let blob = new Blob([csv], {
                type: "application/csvcharset=UTF-8"
            });
            saveAs(blob, csvFileName) ;
            func.setToast(true, false,"CSV exported successfully")
        }
    }



    const promotedBulkActions = (selectedResourcesArr) => {
        let selectedResources;
        if(treeView){
            selectedResources = selectedResourcesArr.flat();
        }else{
            selectedResources = selectedResourcesArr
        }
        let actions = [
            {
                content: `Remove collection${func.addPlurality(selectedResources.length)}`,
                onAction: () => handleCollectionsAction(selectedResources, api.deleteMultipleCollections, "deleted")
            },
            {
                content: 'Export as CSV',
                onAction: () => exportCsv(selectedResources)
            }
        ];

        const deactivated = allCollections.filter(x => { return x.deactivated }).map(x => x.id);
        const activated = allCollections.filter(x => { return !x.deactivated }).map(x => x.id);
        if (selectedResources.every(v => { return activated.includes(v) })) {
            actions.push(
                {
                    content: `Deactivate collection${func.addPlurality(selectedResources.length)}`,
                    onAction: () => {
                        const message = "Deactivating a collection will stop traffic ingestion and testing for this collection. Please sync the usage data via Settings > billing after deactivating a collection to reflect your updated usage. Are you sure, you want to deactivate this collection ?"
                        func.showConfirmationModal(message, "Deactivate collection", () => handleCollectionsAction(selectedResources, collectionApi.deactivateCollections, "deactivated") )
                    }
                }
            )
        } else if (selectedResources.every(v => { return deactivated.includes(v) })) {
            actions.push(
                {
                    content: `Reactivate collection${func.addPlurality(selectedResources.length)}`,
                    onAction: () =>  {
                        const message = "Please sync the usage data via Settings > billing after reactivating a collection to resume data ingestion and testing."
                        func.showConfirmationModal(message, "Activate collection", () => handleCollectionsAction(selectedResources, collectionApi.activateCollections, "activated"))
                    }
                }
            )
        }

        const toggleTypeContent = (
            <Popover
                activator={<div onClick={() => setPopover(!popover)}>Set ENV type</div>}
                onClose={() => setPopover(false)}
                active={popover}
                autofocusTarget="first-node"
            >
                <Popover.Pane>
                    <ActionList
                        actionRole="menuitem"
                        items={[
                            {content: 'Staging', onAction: () => updateEnvType(selectedResources, "STAGING")},
                            {content: 'Production', onAction: () => updateEnvType(selectedResources, "PRODUCTION")},
                            {content: 'Reset', onAction: () => updateEnvType(selectedResources, null)},
                        ]}
                    />
                </Popover.Pane>
            </Popover>
        )

        const toggleEnvType = {
            content: toggleTypeContent
        }

        const bulkActionsOptions = [...actions];
        if(selectedTab !== 'groups') {
            bulkActionsOptions.push(toggleEnvType)
        }
        return bulkActionsOptions
    }
    const updateData = (dataMap) => {
        let copyObj = data;
        Object.keys(copyObj).forEach((key) => {
            data[key].length > 0 && data[key].forEach((c) => {
                c['envType'] = dataMap[c.id]
                c['envTypeComp'] = dataMap[c.id] ? <Badge size="small" tone="info">{func.toSentenceCase(dataMap[c.id])}</Badge> : null
            })
        })
        setData(copyObj)
        setRefreshData(!refreshData)
    }

    const updateEnvType = (apiCollectionIds,type) => {
        let copyObj = JSON.parse(JSON.stringify(envTypeMap))
        apiCollectionIds.forEach(id => copyObj[id] = type)
        api.updateEnvTypeOfCollection(type,apiCollectionIds).then((resp) => {
            func.setToast(true, false, "ENV type updated successfully")
            setEnvTypeMap(copyObj)
            updateData(copyObj)
        })
        resetResourcesSelected();

    }

    const modalComponent = <CreateNewCollectionModal
        key="modal"
        active={active}
        setActive={setActive}
        createCollectionModalActivatorRef={createCollectionModalActivatorRef}
        fetchData={fetchData}
    />

    let coverage = '0%';
    if(summaryData.totalEndpoints !== 0){
        if(summaryData.totalEndpoints < summaryData.totalTestedEndpoints){
            coverage = '100%'
        }else{
            coverage = Math.ceil((summaryData.totalTestedEndpoints * 100) / summaryData.totalEndpoints) + '%'
        }
    }

      const summaryItems = [
        {
            title: "Total APIs",
            data: transform.formatNumberWithCommas(summaryData.totalEndpoints),
        },
        {
            title: "Critical APIs",
            data: transform.formatNumberWithCommas(summaryData.totalCriticalEndpoints),
        },
        {
            title: "Tested APIs (Coverage)",
            data: coverage
        },
        {
            title: "Sensitive in response APIs",
            data: transform.formatNumberWithCommas(summaryData.totalSensitiveEndpoints),
        }
    ]

    const secondaryActionsComp = (
        <InlineStack gap={200}>
            <Popover
                active={moreActions}
                activator={(
                    <Button onClick={() => setMoreActions(!moreActions)} disclosure removeUnderline>
                        More Actions
                    </Button>
                )}
                autofocusTarget="first-node"
                onClose={() => { setMoreActions(false) }}
                preferredAlignment="right"
            >
                <Popover.Pane fixed>
                    <Popover.Section>
                        <Button   onClick={() =>exportCsv()} removeUnderline variant="monochromePlain">
                            <InlineStack gap={"200"}>
                                <Box><Icon source={FileIcon} /></Box>
                                <Text>Export as CSV</Text>
                            </InlineStack>
                        </Button>
                        </Popover.Section>
                    <Popover.Section>
                        <Button


                            onClick={() => setTreeView(!treeView)}
                            removeUnderline
                            variant="monochromePlain">
                            <InlineStack gap={"200"}>
                                <Box><Icon source={treeView ? HideIcon : ViewIcon} /></Box>
                                <Text>{treeView ? "Hide tree view": "Display tree view"}</Text>
                            </InlineStack>
                        </Button>
                    </Popover.Section>
                </Popover.Pane>
            </Popover>
            <Button id={"create-new-collection-popup"} secondaryActions onClick={showCreateNewCollectionPopup}>Create new collection</Button>
        </InlineStack>
    )


    const handleSelectedTab = (selectedIndex) => {
        setSelected(selectedIndex)
    }

    const tableComponent = (
        treeView ?
        <TreeViewTable
            collectionsArr={normalData.filter((x) => x?.type !== "API_GROUP")}
            sortOptions={sortOptions}
            resourceName={resourceName}
            tableHeaders={headers.filter((x) => x.shouldMerge !== undefined)}
            promotedBulkActions={promotedBulkActions}
        />:
        <GithubSimpleTable
            key={refreshData}
            pageLimit={100}
            data={data[selectedTab]} 
            sortOptions={sortOptions} 
            resourceName={resourceName} 
            filters={[]}
            disambiguateLabel={disambiguateLabel} 
            headers={headers}
            selectable={true}
            promotedBulkActions={promotedBulkActions}
            mode={IndexFiltersMode.Default}
            headings={headers}
            useNewRow={true}
            condensedHeight={true}
            tableTabs={tableTabs}
            onSelect={handleSelectedTab}
            selected={selected}
            csvFileName={"Inventory"}
        />
    )

    const components = loading ? [<SpinnerCentered key={"loading"}/>]: [<SummaryCardInfo summaryItems={summaryItems} key="summary"/>, (!hasUsageEndpoints ? <CollectionsPageBanner key="page-banner" /> : null) ,modalComponent, tableComponent]

    return (
        <PageWithMultipleCards
            title={
                <TitleWithInfo 
                    tooltipContent={"Akto automatically groups similar APIs into meaningful collections based on their subdomain names. "}
                    titleText={"API collections"} 
                    docsUrl={"https://docs.akto.io/api-inventory/concepts"}
                />
            }
            primaryAction={<Button
                id={"explore-mode-query-page"}

                secondaryActions
                onClick={navigateToQueryPage}
                variant="primary">Explore mode</Button>}
            isFirstPage={true}
            components={components}
            secondaryActions={secondaryActionsComp}
        />
    );
}

export default ApiCollections 