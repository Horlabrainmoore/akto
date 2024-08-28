import request from "@/util/request"

const homeRequests = {
    getCollections: async () => {
        const resp = await request({
            url: '/api/getAllCollections',
            method: 'post',
            data: {}
        })
        return resp
    },
    getTrafficAlerts(){
        return request({
            url: '/api/getAllTrafficAlerts',
            method: 'post',
            data: {}
        })
    },
    markAlertAsDismissed(trafficAlert){
        return request({
            url: '/api/markAlertAsDismissed',
            method: 'post',
            data: {trafficAlert}
        })
    },
}

export default homeRequests