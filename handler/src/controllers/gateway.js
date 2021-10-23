export default class GatewayController {
  async sync(ctx) {
    const parent = (await ctx.req.json()).parent;
    const name = parent.metadata.name;
    const spec = parent.spec;

    const pod = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: `${name}-oauth2-proxy`,
        labels: {
          app: `${name}-oauth2-proxy`,
        },
      },
      spec: {
        containers: [
          {
            image: 'quay.io/oauth2-proxy/oauth2-proxy',
            name: 'oauth2-proxy',
            env: [
              {
                name: 'OAUTH2_PROXY_PROVIDER',
                value: 'oidc',
              },
              {
                name: 'OAUTH2_PROXY_OIDC_ISSUER_URL',
                value: spec.issuer,
              },
              {
                name: 'OAUTH2_PROXY_CLIENT_ID',
                value: spec.clientId,
              },
              {
                name: 'OAUTH2_PROXY_CLIENT_SECRET',
                value: spec.clientSecret,
              },
              //TODO build cookie secret
              {
                name: 'OAUTH2_PROXY_COOKIE_SECRET',
                value: spec.cookieSecret,
              },
              {
                name: 'OAUTH2_PROXY_EMAIL_DOMAINS',
                value: '*',
              },
              {
                name: 'OAUTH2_PROXY_SET_XAUTHREQUEST',
                value: 'true',
              },
              // enable the next line to get the entire jwt as X-Access-Token, but beware it is big!
              //{
              //  name: 'OAUTH2_PROXY_PASS_ACCESS_TOKEN',
              //  value: 'true',
              //},
              //
              // enable this to allow bot users to pass valid tokens as well
              //{
              //  name: 'OAUTH2_PROXY_SKIP_JWT_BEARER_TOKENS',
              //  value: 'true',
              //},
              {
                name: 'OAUTH2_PROXY_HTTP_ADDRESS',
                value: '0.0.0.0:4180',
              },
              {
                name: 'OAUTH2_PROXY_REVERSE_PROXY',
                value: 'true',
              },
              {
                name: 'OAUTH2_PROXY_SESSION_STORE_TYPE',
                value: 'redis',
              },
              {
                name: 'OAUTH2_PROXY_REDIS_CONNECTION_URL',
                value: 'redis://127.0.0.1',
              },
            ],
          },
          {
            image: 'redis:latest',
            name: 'oauth2-proxy-redis',
          },
        ],
      },
    };

    const service = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: `${name}-oauth2-proxy`,
      },
      spec: {
        selector: {
          app: `${name}-oauth2-proxy`,
        },
        ports: [
          {
            protocol: 'TCP',
            port: 4180,
          },
        ],
      },
    };

    return ctx.render({json: {status: {}, children: [pod, service]}});
  }
}
