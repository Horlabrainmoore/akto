package com.akto.testing;

import com.akto.dto.RawApi;
import com.akto.dto.testing.TestingRunResult;
import okhttp3.*;
import okio.Buffer;
import org.jetbrains.annotations.NotNull;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.io.IOException;
import java.security.KeyManagementException;
import java.security.NoSuchAlgorithmException;
import java.security.cert.CertificateException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

public class HTTPClientHandler {
    private int readTimeout = 30;
    private final OkHttpClient clientWithoutFollowRedirect;
    private final OkHttpClient clientWithFollowRedirect;

    private static OkHttpClient.Builder builder(boolean followRedirects, int readTimeout) {
        return new OkHttpClient().newBuilder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(readTimeout, TimeUnit.SECONDS)
                .connectionPool(new ConnectionPool(256, 5L, TimeUnit.MINUTES))
                .sslSocketFactory(trustAllSslSocketFactory, (X509TrustManager)trustAllCerts[0])
                .hostnameVerifier((hostname, session) -> true)
                .followRedirects(followRedirects);
    }

    private HTTPClientHandler(boolean isSaas) {
        if(isSaas) readTimeout = 60;

        clientWithoutFollowRedirect = builder(false, readTimeout).build();
        clientWithFollowRedirect = builder(true, readTimeout).build();
    }

    public OkHttpClient getNewDebugClient(boolean isSaas, boolean followRedirects, List<TestingRunResult.TestLog> testLogs) {
        if(isSaas) readTimeout = 60;
        return builder(followRedirects, readTimeout)
                .addInterceptor(new NormalResponseInterceptor(testLogs))
                .addNetworkInterceptor(new NetworkResponseInterceptor(testLogs))
                .build();
    }

    static class NormalResponseInterceptor implements Interceptor {

        List<TestingRunResult.TestLog> testLogs;
        @Override
        public @NotNull Response intercept(Chain chain) throws IOException {
            Request request = chain.request();
            try {
                Buffer buffer = new Buffer();
                RequestBody requestBody = request.body();
                if (requestBody != null && requestBody.contentLength() != -1) {
                    requestBody.writeTo(buffer);
                    String requestBodyString = buffer.readUtf8();
                    testLogs.add(new TestingRunResult.TestLog(TestingRunResult.TestLogType.INFO, "Request Body: " + requestBodyString));
                }
            } catch (Exception e) {
                testLogs.add(new TestingRunResult.TestLog(TestingRunResult.TestLogType.ERROR, "Error while parsing request body: " + e.getMessage()));
            }

            Response response = chain.proceed(request);


            if (response == null) {
                testLogs.add(new TestingRunResult.TestLog(TestingRunResult.TestLogType.INFO, "Response Body: null"));
            } else {
                try {
                    ResponseBody responseBody = response.peekBody(1024*1024);
                    String body = responseBody != null ? responseBody.string() : "null";
                    testLogs.add(new TestingRunResult.TestLog(TestingRunResult.TestLogType.INFO, "Response Body: " + body));
                } catch (Exception e) {
                    testLogs.add(new TestingRunResult.TestLog(TestingRunResult.TestLogType.ERROR, "Error while parsing resposne body: " + e.getMessage()));
                }
            }

            return response;
        }

        public NormalResponseInterceptor(List<TestingRunResult.TestLog> testLogs) {
            this.testLogs = testLogs;
        }
    }

    static class NetworkResponseInterceptor implements Interceptor {
        List<TestingRunResult.TestLog> testLogs;
        @Override
        public @NotNull Response intercept(Chain chain) throws IOException {
            Request request = chain.request();

            try {
                Map<String,List<String>> requestHeadersMap = ApiExecutor.generateHeadersMapFromHeadersObject(request.headers());;
                String requestHeadersString = RawApi.convertHeaders(requestHeadersMap);
                testLogs.add(new TestingRunResult.TestLog(TestingRunResult.TestLogType.INFO, "Request Headers: " + requestHeadersString));

                testLogs.add(new TestingRunResult.TestLog(TestingRunResult.TestLogType.INFO, "Hitting URL: " + request.url()));
            } catch (Exception e) {
                testLogs.add(new TestingRunResult.TestLog(TestingRunResult.TestLogType.ERROR, "Error while parsing headers or url: " + e.getMessage()));
            }

            Response response = chain.proceed(request);

            if (response == null) {
                testLogs.add(new TestingRunResult.TestLog(TestingRunResult.TestLogType.INFO, "Response StatusCode: " + 0));
            } else {
                try {
                    testLogs.add(new TestingRunResult.TestLog(TestingRunResult.TestLogType.INFO, "Response StatusCode: " + response.code()));
                    Map<String,List<String>> responseHeadersMap = ApiExecutor.generateHeadersMapFromHeadersObject(response.headers());;
                    String responseHeadersString = RawApi.convertHeaders(responseHeadersMap);
                    testLogs.add(new TestingRunResult.TestLog(TestingRunResult.TestLogType.INFO, "Response Headers: " + responseHeadersString));
                } catch (Exception e) {
                    testLogs.add(new TestingRunResult.TestLog(TestingRunResult.TestLogType.ERROR, "Error while parsing response headers: " + e.getMessage()));
                }
            }

            return response;
        }

        public NetworkResponseInterceptor(List<TestingRunResult.TestLog> testLogs) {
            this.testLogs = testLogs;
        }
    }

    private static final TrustManager[] trustAllCerts = new TrustManager[] {
            new X509TrustManager() {
                @Override
                public void checkClientTrusted(java.security.cert.X509Certificate[] chain, String authType) throws CertificateException {
                }

                @Override
                public void checkServerTrusted(java.security.cert.X509Certificate[] chain, String authType) throws CertificateException {
                }

                @Override
                public java.security.cert.X509Certificate[] getAcceptedIssuers() {
                    return new java.security.cert.X509Certificate[]{};
                }
            }
    };

    private static final SSLContext trustAllSslContext;
    static {
        try {
            trustAllSslContext = SSLContext.getInstance("SSL");
            trustAllSslContext.init(null, trustAllCerts, new java.security.SecureRandom());
        } catch (NoSuchAlgorithmException | KeyManagementException e) {
            throw new RuntimeException(e);
        }
    }

    private static final SSLSocketFactory trustAllSslSocketFactory = trustAllSslContext.getSocketFactory();

    public static HTTPClientHandler instance = null;

    public static void initHttpClientHandler(boolean isSaas) {
        if (instance == null) {
            instance = new HTTPClientHandler(isSaas);
        }
    }

    public OkHttpClient getHTTPClient (boolean followRedirect) {
        if (followRedirect) {
            return clientWithFollowRedirect;
        }
        return clientWithoutFollowRedirect;
    }
}
