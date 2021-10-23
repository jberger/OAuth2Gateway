export default class DomainController {
  async customize(ctx) {
    const input = await ctx.req.json();

    const paths = input.parent.spec.paths;
    const services = paths.map(path => path.service.name);

    const relatedResources = [
      {
        apiVersion: 'oauth2gateway.jberger.github.io/v1alpha1',
        resource: 'gateways',
        names: [input.parent.spec.gateway],
      },
      {
        apiVersion: 'v1',
        resource: 'services',
        names: services,
      }
    ];

    return ctx.render({json: { relatedResources }});
  }

  async sync(ctx) {
    const input = await ctx.req.json();

    const domain = input.parent;
    const host = domain.spec.host;
    const gateway_name = domain.spec.gateway;
    //const gateway = input.related['Gateway.oauth2gateway.jberger.github.io/v1alpha1'][gateway_name];
    const services = input.related['Service.v1'];
    const name = domain.metadata.name;

    const annotations = domain.spec.ingressAnnotations;

    const tls = [];
    if (domain.spec.tlsSecretName) {
      tls.push({
        hosts: [ host ],
        secretName: domain.spec.tlsSecretName,
      });
    }

    const paths = domain.spec.paths.map(path => {
      const service = services[path.service.name];
      const port = path.service.port ?? service.spec.ports[0].port;
      return {
        path: path.path,
        pathType: 'Prefix',
        backend: {
          service: {
            name: service.metadata.name,
            port: {
              number: port,
            },
          },
        },
      };
    });

    //TODO oauth2Path

    const standard = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: `${name}-ingress`,
        annotations: {
          'nginx.ingress.kubernetes.io/auth-response-headers': 'x-auth-request-user, x-auth-request-email, x-auth-request-groups, x-auth-request-preferred-username, x-auth-request-access-token',
          'nginx.ingress.kubernetes.io/proxy-buffer-size': '64k',
          ...annotations,
          'kubernetes.io/ingress.class': "nginx",
          'nginx.ingress.kubernetes.io/auth-url': 'https://$host/oauth2/auth',
          'nginx.ingress.kubernetes.io/auth-signin': 'https://$host/oauth2/start?rd=$escaped_request_uri',
        },
      },
      spec: {
        tls,
        rules: [{
          host,
          http: {
            paths,
          },
        }],
      },
    };

    const proxy = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: `${name}-oauth2-proxy-ingress`,
        annotations: {
          ...annotations,
          'kubernetes.io/ingress.class': "nginx",
        },
      },
      spec: {
        tls,
        rules: [{
          host,
          http: {
            paths: [{
              path: '/oauth2',
              pathType: 'Prefix',
              backend: {
                service: {
                  name: `${gateway_name}-oauth2-proxy`,
                  port: {
                    number: 4180,
                  },
                },
              },
            }],
          },
        }],
      },
    };

    return ctx.render({json: { status: {}, children: [ standard, proxy ] }});
  }
}
