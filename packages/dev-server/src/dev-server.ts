import type http from 'http'
import { getRequestListener } from '@hono/node-server'
import type { Plugin, ViteDevServer, Connect } from 'vite'

export type DevServerOptions = {
  entry?: string
  injectClientScript?: boolean
}

export function devServer(options?: DevServerOptions): Plugin[] {
  const entry = options?.entry ?? './src/index.ts'
  const plugins: Plugin[] = [
    {
      name: 'sonik-dev-server',
      config: () => {
        return {
          build: {
            rollupOptions: {
              input: [entry],
            },
          },
        }
      },
      configureServer: async (server) => {
        async function createMiddleware(server: ViteDevServer): Promise<Connect.HandleFunction> {
          return async function (
            req: http.IncomingMessage,
            res: http.ServerResponse,
            next: Connect.NextFunction
          ): Promise<void> {
            if (
              req.url?.endsWith('.ts') ||
              req.url?.endsWith('.tsx') ||
              req.url?.startsWith('/@') ||
              req.url?.startsWith('/node_modules')
            ) {
              return next()
            }

            const appModule = await server.ssrLoadModule(entry)
            const app = appModule['default']

            if (!app) {
              console.error(`Failed to find a named export "default" from ${entry}`)
              return next()
            }

            getRequestListener(async (request) => {
              const response = await app.fetch(request)
              if (
                options?.injectClientScript !== false &&
                // If the response is a streaming, it does not inject the script:
                !response.headers.get('transfer-encoding')?.match('chunked') &&
                response.headers.get('content-type')?.match(/^text\/html/)
              ) {
                const body =
                  (await response.text()) + '<script type="module" src="/@vite/client"></script>'
                const headers = new Headers(response.headers)
                headers.delete('content-length')
                return new Response(body, {
                  status: response.status,
                  headers,
                })
              }
              return response
            })(req, res)
          }
        }
        server.middlewares.use(await createMiddleware(server))
      },
    },
  ]
  return plugins
}