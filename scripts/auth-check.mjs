import { createAuthClient } from "@neon/auth";
import { BetterAuthVanillaAdapter } from "@neon/auth/vanilla/adapters";

process.loadEnvFile(".env.local");

const cookies = new Map();
const auth = createAuthClient(process.env.NEON_AUTH_BASE_URL, {
  adapter: BetterAuthVanillaAdapter({
    fetchOptions: {
      headers: { Origin: "http://localhost:5173" },
      onRequest: (ctx) => {
        if (cookies.size)
          ctx.headers.set(
            "cookie",
            [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
          );
      },
      onSuccess: (ctx) => {
        for (const c of ctx.response.headers.getSetCookie()) {
          const [pair] = c.split(";");
          const i = pair.indexOf("=");
          cookies.set(pair.slice(0, i), pair.slice(i + 1));
        }
      },
    },
  }),
});

const email = process.argv[2] ?? `margin-test-${Date.now()}@example.com`;
const password = process.argv[3] ?? crypto.randomUUID();

const check = (step, { data, error }) => {
  if (error)
    throw new Error(
      `${step}: ${error.status ?? ""} ${error.message ?? JSON.stringify(error)}`,
    );
  return data;
};

const signedUp = check(
  "signUp",
  await auth.signUp.email({ email, password, name: "Margin Test" }),
);
console.log("signUp", signedUp.user.id, signedUp.user.email);

const signedIn = check("signIn", await auth.signIn.email({ email, password }));
console.log("signIn", signedIn.user.id);

const session = check("getSession", await auth.getSession());
console.log("getSession", session.user.id, session.user.email);

const token = session.session.token;
console.log("jwt", token.split(".").length === 3, `${token.slice(0, 12)}...`);
if (process.env.JWT_OUT)
  (await import("node:fs")).writeFileSync(process.env.JWT_OUT, token);
