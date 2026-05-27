import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import { ProxyAgent, request as undiciRequest } from 'undici'
import { URL } from 'url'
import type { AccountProxy } from '../interface/Account'

class AxiosClient {
    private readonly proxyAgent: ProxyAgent | null = null
    private readonly account: AccountProxy
    private readonly timeout: number = 20000

    constructor(account: AccountProxy) {
        this.account = account

        if (this.account.url && this.account.proxyAxios) {
            this.proxyAgent = this.createProxyAgent(this.account)
        }
    }

    private createProxyAgent(proxyConfig: AccountProxy): ProxyAgent {
        const { url: baseUrl, port, username, password } = proxyConfig

        let urlObj: URL
        try {
            urlObj = new URL(baseUrl)
        } catch {
            try {
                urlObj = new URL(`http://${baseUrl}`)
            } catch {
                throw new Error(`Invalid proxy URL format: ${baseUrl}`)
            }
        }

        // Set port if provided
        if (!urlObj.port && port) {
            urlObj.port = port.toString()
        }

        // Set credentials if provided (undici handles this better than axios)
        if (username?.trim() && password?.trim()) {
            urlObj.username = encodeURIComponent(username)
            urlObj.password = encodeURIComponent(password)
        }

        const proxyUrl = urlObj.toString()

        return new ProxyAgent({
            uri: proxyUrl,
            keepAliveTimeout: 10000,
            keepAliveMaxTimeout: 10000
        })
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    public async request(config: AxiosRequestConfig, bypassProxy = false): Promise<AxiosResponse> {
        const maxRetries = 5
        let lastError: Error | null = null

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const url = config.url!
                const method = (config.method || 'GET').toUpperCase()

                // Prepare headers
                const headers: Record<string, string> = {}
                if (config.headers) {
                    for (const [key, value] of Object.entries(config.headers)) {
                        if (value !== undefined && value !== null) {
                            headers[key] = String(value)
                        }
                    }
                }

                // Prepare body
                let body: string | undefined
                if (config.data) {
                    if (config.data instanceof URLSearchParams) {
                        body = config.data.toString()
                        if (!headers['content-type'] && !headers['Content-Type']) {
                            headers['content-type'] = 'application/x-www-form-urlencoded'
                        }
                    } else if (typeof config.data === 'object') {
                        body = JSON.stringify(config.data)
                        if (!headers['content-type'] && !headers['Content-Type']) {
                            headers['content-type'] = 'application/json'
                        }
                    } else {
                        body = String(config.data)
                    }
                }

                // Make request with undici
                const response = await undiciRequest(url, {
                    method,
                    headers,
                    body,
                    dispatcher: bypassProxy ? undefined : this.proxyAgent || undefined,
                    headersTimeout: this.timeout,
                    bodyTimeout: this.timeout
                })

                // Read response body
                const responseBody = await response.body.text()

                // Parse response data
                let data: unknown = responseBody
                try {
                    data = JSON.parse(responseBody)
                } catch {
                    // Keep as text if JSON parse fails
                }

                // Create axios-compatible response
                const axiosResponse: AxiosResponse = {
                    data,
                    status: response.statusCode,
                    statusText: '',
                    headers: response.headers,
                    config: config as never,
                    request: undefined
                }

                // Check if we should retry on error status
                if (response.statusCode === 429 || (response.statusCode >= 500 && response.statusCode <= 599)) {
                    throw new Error(`HTTP ${response.statusCode}`)
                }

                return axiosResponse

            } catch (error) {
                lastError = error as Error

                // Don't retry on client errors (4xx except 429)
                if (error && typeof error === 'object' && 'message' in error) {
                    const statusMatch = (error.message as string).match(/HTTP (\d+)/)
                    if (statusMatch && statusMatch[1]) {
                        const status = parseInt(statusMatch[1])
                        if (status >= 400 && status < 500 && status !== 429) {
                            throw error
                        }
                    }
                }

                // Exponential backoff
                if (attempt < maxRetries - 1) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 10000)
                    await this.sleep(delay)
                }
            }
        }

        throw lastError || new Error('Request failed after retries')
    }
}

export default AxiosClient
