use Mojolicious::Lite -signatures;

use Digest::SHA qw(sha1_base64);

post '/proxy/sync' => sub ($c) {
  my $parent = $c->req->json('/parent');
  my $name = $parent->{metadata}{name};
  my $pod = {
    apiVersion => 'v1',
    kind => 'Pod',
    metadata => {
      name => "$name-oauth2-proxy",
      labels => {
        app => "$name-oauth2-proxy",
      },
    },
    spec => {
      containers => [
        {
          image => 'quay.io/oauth2-proxy/oauth2-proxy',
          name => 'oauth2-proxy',
          env => [
            {
              name => 'OAUTH2_PROXY_PROVIDER',
              value => 'oidc',
            },
            {
              name => 'OAUTH2_PROXY_OIDC_ISSUER_URL',
              value => $parent->{spec}{issuer},
            },
            {
              name => 'OAUTH2_PROXY_CLIENT_ID',
              value => $parent->{spec}{clientId},
            },
            {
              name => 'OAUTH2_PROXY_CLIENT_SECRET',
              value => $parent->{spec}{clientSecret},
            },
            {
              name => 'OAUTH2_PROXY_COOKIE_SECRET',
              value => $parent->{spec}{cookieSecret},
            },
            {
              name => 'OAUTH2_PROXY_EMAIL_DOMAINS',
              value => '*',
            },
            {
              name => 'OAUTH2_PROXY_SET_XAUTHREQUEST',
              value => 'true',
            },
            # enable the next line to get the entire jwt as X-Access-Token, but beware it is big!
            #{
            #  name => 'OAUTH2_PROXY_PASS_ACCESS_TOKEN',
            #  value => 'true',
            #},
            #{
            #  name => 'OAUTH2_PROXY_SKIP_JWT_BEARER_TOKENS',
            #  value => 'true',
            #},
            {
              name => 'OAUTH2_PROXY_HTTP_ADDRESS',
              value => '0.0.0.0:4180',
            },
            {
              name => 'OAUTH2_PROXY_REVERSE_PROXY',
              value => 'true',
            },
            {
              name => 'OAUTH2_PROXY_SESSION_STORE_TYPE',
              value => 'redis',
            },
            {
              name => 'OAUTH2_PROXY_REDIS_CONNECTION_URL',
              value => 'redis://127.0.0.1',
            },
          ],
        },
        {
          image => 'redis:latest',
          name => 'oauth2-proxy-redis',
        },
      ],
    },
  };

  my $service = {
    apiVersion => 'v1',
    kind => 'Service',
    metadata => {
      name => "$name-oauth2-proxy",
    },
    spec => {
      selector => {
        app => "$name-oauth2-proxy",
      },
      ports => [
        {
          protocol => 'TCP',
          port => 4180,
        },
      ],
    },
  };

  $c->render(json => {status => {}, children => [$pod, $service]});
};

post '/ingress/customize' => sub ($c) {
  my $name = $c->req->json('/parent/metadata/annotations/oauth2gateway.jberger.xyz~1gateway.name');
  my @resources = (
    {
      apiVersion => 'oauth2gateway.jberger.xyz/v1alpha1',
      resource => 'oauth2gateways',
      name => [$name],
    },
    {
      apiVersion => 'v1',
      resource => 'services',
      name => ["$name-oauth2-proxy"],
    },
  );

  $c->render(json => { relatedResources => \@resources });
};

post '/ingress/sync' => sub ($c) {
  my $name = $c->req->json('/object/metadata/annotations/oauth2gateway.jberger.xyz~1gateway.name');
  my $gateway = $c->req->json("/related/OAuth2Gateway.oauth2gateway.jberger.xyz~1v1alpha1/$name");
  my $service = $c->req->json("/related/Service.v1/$name-oauth2-proxy");
  my $annotations = {
    'nginx.ingress.kubernetes.io/auth-url' => 'https://$host/oauth2/auth',
    'nginx.ingress.kubernetes.io/auth-signin' => 'https://$host/oauth2/start?rd=$escaped_request_uri',
    'nginx.ingress.kubernetes.io/auth-response-headers' => 'x-auth-request-user, x-auth-request-email, x-auth-request-groups, x-auth-request-preferred-username, x-auth-request-access-token',
    'nginx.ingress.kubernetes.io/proxy-buffer-size' => '64k',
  };
  my $siphon = {
    apiVersion => 'networking.k8s.io/v1',
    kind => 'Ingress',
    metadata => {
      name => $c->req->json('/object/metadata/name') . "-$name-oauth2-proxy",
      annotations => $c->req->json('/object/metadata/annotations'),
    },
    spec => $c->req->json('/object/spec'),
  };
  # remove the added annotations
  delete @{$siphon->{metadata}{annotations}}{
    'oauth2gateway.jberger.xyz/gateway.name',
    keys %$annotations
  };
  my $host = $siphon->{spec}{rules}[0]{host};
  #my $path = $rule->{http}{paths}[0]{path};
  $siphon->{spec}{rules} = [{
    host => $host,
    http => {
      paths => [{
        path => '/oauth2',
        pathType => 'Prefix',
        backend => {
          service => {
            name => $service->{metadata}{name},
            port => {
              number => $service->{spec}{ports}[0]{port},
            },
          },
        },
      }],
    },
  }];
  $c->render(json => {
    annotations => $annotations,
    attachments => [$siphon],
  });
};

# stolen from mojo request_id generation
helper generateSecret => sub ($c) {
  state $seed    = $$ . time . rand;
  state $counter = int rand 0xffffff;
  my $b64 = substr(sha1_base64($seed . ($counter = ($counter + 1) % 0xffffff)), 0, 15);
  $b64 =~ tr!+/!-_!;
  return $b64;
};

app->start;

