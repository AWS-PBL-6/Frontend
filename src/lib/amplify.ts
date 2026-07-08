import { Amplify } from "aws-amplify";
import { config } from "./config";

const origin = window.location.origin + "/";

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: config.userPoolId,
      userPoolClientId: config.userPoolClientId,
      loginWith: {
        email: true,
        oauth: {
          domain: config.cognitoDomain,
          scopes: ["openid", "email", "profile"],
          redirectSignIn: [origin],
          redirectSignOut: [origin],
          responseType: "code",
          providers: config.enableGoogle ? ["Google"] : [],
        },
      },
    },
  },
});
