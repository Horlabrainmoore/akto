import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { history } from "@/util/history";
import Store from "../store";
import homeFunctions from "./home/module";
import { useEffect, useState } from "react";
import { Frame, Toast, VerticalStack } from "@shopify/polaris";
import "./dashboard.css"
import func from "@/util/func"
import transform from "./testing/transform";
import PersistStore from "../../main/PersistStore";
import ConfirmationModal from "../components/shared/ConfirmationModal";
import AlertsBanner from "./AlertsBanner";
import dashboardFunc from "./transform";
import homeRequests from "./home/api";

function Dashboard() {

    const location = useLocation();
    history.location = location
    history.navigate = useNavigate();
    const setAllCollections = PersistStore(state => state.setAllCollections)
    const setCollectionsMap = PersistStore(state => state.setCollectionsMap)
    const setHostNameMap = PersistStore(state => state.setHostNameMap)

    const allCollections = PersistStore(state => state.allCollections)
    const collectionsMap = PersistStore(state => state.collectionsMap)

    const subCategoryMap = PersistStore(state => state.subCategoryMap)

    const fetchAllCollections = async () => {
        let apiCollections = await homeFunctions.getAllCollections()
        const allCollectionsMap = func.mapCollectionIdToName(apiCollections)
        const allHostNameMap = func.mapCollectionIdToHostName(apiCollections)
        setHostNameMap(allHostNameMap)
        setCollectionsMap(allCollectionsMap)
        setAllCollections(apiCollections)
    }
    const trafficAlerts = PersistStore(state => state.trafficAlerts)
    const setTrafficAlerts = PersistStore(state => state.setTrafficAlerts)
    const [displayItems, setDisplayItems] = useState([])

    const fetchMetadata = async () => {
        await transform.setTestMetadata();
    };

    useEffect(() => {
        if((allCollections && allCollections.length === 0) || (Object.keys(collectionsMap).length === 0)){
            fetchAllCollections()
        }
        if (!subCategoryMap || (Object.keys(subCategoryMap).length === 0)) {
            fetchMetadata();
        }
        if(window.Beamer){
            window.Beamer.init();
        }
        if(trafficAlerts == null){
            homeRequests.getTrafficAlerts().then((resp) => {
                setDisplayItems(dashboardFunc.sortAndFilterAlerts(resp))
                setTrafficAlerts(resp)
            })
        }else{
            setDisplayItems(dashboardFunc.sortAndFilterAlerts(trafficAlerts))
        }
    }, [])

    const toastConfig = Store(state => state.toastConfig)
    const setToastConfig = Store(state => state.setToastConfig)

    const disableToast = () => {
        setToastConfig({
            isActive: false,
            isError: false,
            message: ""
        })
    }

    const toastMarkup = toastConfig.isActive ? (
        <Toast content={toastConfig.message} error={toastConfig.isError} onDismiss={disableToast} duration={2000} />
    ) : null;

    const confirmationModalConfig = Store(state => state.confirmationModalConfig)

    const ConfirmationModalMarkup = <ConfirmationModal
        modalContent={confirmationModalConfig.modalContent}
        primaryActionContent={confirmationModalConfig.primaryActionContent}
        primaryAction={confirmationModalConfig.primaryAction}
    />
    const handleOnDismiss = async(index) => {
        let alert = displayItems[index];
        let newTrafficFilters = []
        trafficAlerts.forEach((a) => {
            if(func.deepComparison(a, alert)){
                a.lastDismissed = func.timeNow()
            }
            newTrafficFilters.push(a);
        })
        setDisplayItems(dashboardFunc.sortAndFilterAlerts(newTrafficFilters));
        setTrafficAlerts(newTrafficFilters)
        alert.lastDismissed = func.timeNow();
        await homeRequests.markAlertAsDismissed(alert);
    }

    return (
        <div className="dashboard">
        <Frame>
            <Outlet />
            {toastMarkup}
            {ConfirmationModalMarkup}
            {displayItems.length > 0 ? <div className="alerts-banner">
                    <VerticalStack gap={"2"}>
                        {displayItems.map((alert, index) => {
                            return(
                                <AlertsBanner key={index} 
                                    type={dashboardFunc.getAlertMessageFromType(alert.alertType)} 
                                    content={alert.content}
                                    severity={dashboardFunc.getBannerStatus(alert.severity)} 
                                    onDismiss= {handleOnDismiss}
                                    index={index}
                                />
                            )
                        })}
                    </VerticalStack>
            </div> : null}
        </Frame>
        </div>
    )
}

export default Dashboard