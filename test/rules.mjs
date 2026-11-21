// Loads the extension in Chromium and checks that Chrome accepts every redirect rule.
// Needs no live instances, so it runs on every push. Run: npm run test:rules
import { checkRulesCompile, launchExtension } from "./browser.mjs";

const { context, worker } = await launchExtension();
try {
  await checkRulesCompile(worker);
} finally {
  await context.close();
}
