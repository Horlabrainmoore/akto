import axios from 'axios'
import PersistStore from '../apps/main/PersistStore';
import func from "./func"
import { history } from './history';

const accessTokenUrl = "/dashboard/accessToken"

// create axios
const service = axios.create({
  baseURL: window.location.origin, // api base_url
  timeout: 60000, // timeout,
  headers: { 'Access-Control-Allow-Origin': '*' }
})

const err = async (error) => {
  const { status, data } = error.response
  const { errors } = data
  const { actionErrors } = data
  const standardMessage = "OOPS! Something went wrong"
  let message = standardMessage
  if (actionErrors !== null && actionErrors !== undefined && actionErrors.length > 0) {
    message = actionErrors[0]
  }

  switch (status) {
    case 400:
      func.setToast(true, true, 'Bad Request ' + data.message);
      break;
    case 422:
      func.setToast(true, true, message);
      break;
    case 401:
      if (history.location.pathname !== "/login") {
        history.navigate("/login")
      }
      func.setToast(true, true, "Please login again");
      break
    case 423:
      func.setToast(true, true, "Please confirm your email first");
      break
    case 429:
      func.setToast(true, true, "Too many requests!! Please try after 1 hour");
      break
    case 403:

      if (message.localeCompare(standardMessage) != 0) {
        func.setToast(true, true, message);
        if (window?.mixpanel?.track && error?.config?.url) {
          window.mixpanel.track("UNAUTHORIZED_API_BLOCKED", {
            "api": error.config.url
          })
        }
        break;
      }

      const originalRequest = error.config;

      if (originalRequest.url === accessTokenUrl) {
        // if done multiple times, then redirect to login.
        func.setToast(true, true, "Session expired. Redirecting you to login page in some time.")
        setTimeout(()=>{
          window.location.pathname = "/login"
        },1500)
        break
      }

      const response = await service({
        url: accessTokenUrl,
        method: 'get',
      })

      console.log('Data received from accessTokenUrl:', response.data);

      window.SIGNUP_INFO = JSON.parse(response.data.signupInfo || '{}');
      window.AVATAR = response.data.avatar;
      window.USER_NAME = response.data.username;
      window.USERS = '{}';
      window.DASHBOARDS = JSON.parse(atob(response.data.dashboards || '[]'));
      window.ACCOUNTS = JSON.parse(response.data.accounts || '{}');
      window.ACTIVE_ACCOUNT = +response.data.activeAccount;
      window.DASHBOARD_MODE = response.data.dashboardMode;
      window.CLOUD_TYPE = response.data.cloudType;
      window.IS_SAAS = response.data.isSaas;
      window.ACCESS_TOKEN = response.data.accessToken;
      window.SIGNUP_INVITATION_CODE = response.data.signupInvitationCode;
      window.SIGNUP_EMAIL_ID = response.data.signupEmailId;
      window.ACCOUNT_NAME = response.data.accountName;
      window.RELEASE_VERSION = response.data.releaseVersion;
      window.RELEASE_VERSION_GLOBAL = response.data.AktoVersionGlobal;
      window.AKTO_UI_MODE = response.data.aktoUIMode;
      window.GITHUB_CLIENT_ID = atob(response.data.githubClientId);
      window.GITHUB_URL = response.data.githubUrl;
      window.STIGG_CUSTOMER_ID = response.data.stiggCustomerId;
      window.STIGG_CUSTOMER_TOKEN = response.data.stiggCustomerToken;
      window.STIGG_CLIENT_KEY = response.data.stiggClientKey;
      window.JIRA_INTEGRATED = response.data.jiraIntegrated;
      window.USER_ROLE = response.data.userRole;
      window.STIGG_IS_OVERAGE = response.data.stiggIsOverage;
      window.USAGE_PAUSED = JSON.parse(response.data.usagePaused || '{}');
      window.STIGG_FEATURE_WISE_ALLOWED = JSON.parse(response.data.stiggFeatureWiseAllowed || '{}');

      if (window.DASHBOARD_MODE === '' && window.IS_SAAS === '' && window.location.host.endsWith('akto.io')) {
          window.DASHBOARD_MODE = 'LOCAL_DEPLOY';
          window.IS_SAAS = 'true';
      }

      window.EXPIRED = response.data.expired;

      return service(originalRequest)
    case 500:
      func.setToast(true, true, "Server Error");
      break

    default:
      break;
  }
  return Promise.reject(error)
}

// request interceptor
// For every request that is sent from the vue app, automatically attach the accessToken from the store
service.interceptors.request.use((config) => {
  config.headers['Access-Control-Allow-Origin'] = '*'
  config.headers['Content-Type'] = 'application/json'
  config.headers["access-token"] = PersistStore.getState().accessToken


  if (window.ACTIVE_ACCOUNT) {
    config.headers['account'] = window.ACTIVE_ACCOUNT
  }

  return config
}, err)

// response interceptor
// For every response that is sent to the vue app, look for access token in header and set it if not null
service.interceptors.response.use((response) => {
  if (response.headers["access-token"] != null) {
    PersistStore.getState().storeAccessToken(response.headers["access-token"])
  }

  if (['put', 'post', 'delete', 'patch'].includes(response.method) && response.data.meta) {
    func.setToast(true, false, response.data.meta.message )
  }
  if (response.data.error) {
    func.setToast(true, true, response.data.error )
  } else {
    if ( window?.mixpanel?.track && response?.config?.url) {
      raiseMixpanelEvent(response.config.url);
    }
  }

  return response.data
}, err)

const black_list_apis = ['dashboard/accessToken', 'api/fetchBurpPluginInfo', 'api/fetchActiveLoaders', 'api/fetchAllSubCategories']
async function raiseMixpanelEvent(api) {
  if (window?.Intercom) {
    if (api?.startsWith("/api/ingestPostman")) {
        window.Intercom("trackEvent", "created-api-collection", {"type": "Postman"})
    }

    if (api?.startsWith("/api/importSwaggerLogs")) {
        window.Intercom("trackEvent", "created-api-collection", {"type": "Swagger"})
    }

    if (api?.startsWith("/api/uploadHar")) {
        window.Intercom("trackEvent", "created-api-collection", {"type": "Har"})
    }

    if (api?.startsWith("/api/startTest")) {
        window.Intercom("trackEvent", "started-test")
    }

    if (api?.startsWith("/api/runTestForGivenTemplate")) {
        window.Intercom("trackEvent", "tested-editor")
    }

    if (api?.startsWith("/api/skipOnboarding") || api?.startsWith("/api/fetchTestSuites")) {
        window.Intercom("trackEvent", "onboarding-started")
    }
  }
  if (api && !black_list_apis.some(black_list_api => api.includes(black_list_api))) {
    window.mixpanel.track(api)
  }
}

export default service
