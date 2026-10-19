import assert from "node:assert/strict";
import { test } from "node:test";
import { withEnv } from "./config.ts";
import { suggest, type Rule } from "./suggest.ts";

const ENV = { LLM_FAST_BASE_URL: "https://llm.test/v1", LLM_FAST_API_KEY: "k", LLM_FAST_MODEL: "m", CHANNEL3_API_KEY: "c3" };
const prod = (id: string, title: string, price: number, domain: string, top: string) => ({
  id, title, images: [{ url: `https://img.test/${id}.png` }], category: { slug: top, title: top, path: [{ slug: top, title: top }] },
  offers: [{ url: `https://buy.test/${id}`, domain, price: { price, currency: "USD" } }],
});

let calls: any[] = [];
function fake(plan: unknown, pick: unknown, products: unknown[]) {
  calls = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, body });
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
    if (url.endsWith("/chat/completions")) {
      const isPlan = body.messages[0].content.startsWith("You are Secay");
      return json({ choices: [{ message: { content: JSON.stringify(isPlan ? plan : pick) } }] });
    }
    return json({ products });
  }) as typeof fetch;
}
const rules: Rule[] = [{ categories: ["electronics"], merchants: ["*"], remaining: "30.00", currency: "USD" }];
const run = (msg: string, r = rules) => withEnv(ENV, () => suggest(msg, [{ role: "user", content: "hi" }], r));

test("small talk does not search", async () => {
  fake({ search: false, reply: "Hi! What should I find for you?" }, null, []);
  const out = await run("hello");
  assert.equal(out.products.length, 0);
  assert.match(out.reply, /What should I find/);
  assert.ok(!calls.some((c) => c.url.includes("trychannel3")));
});

test("filters by rules before the model and returns picks with images", async () => {
  fake(
    { search: true, query: "usb c cable", max_unit_price: null, quantity: 1 },
    { picks: [1, 0, 9], reply: "Two good cables from $9.99." },
    [
      prod("a", "USB-C Cable A", 12, "target.com", "electronics"),
      prod("b", "USB-C Cable B", 9.99, "baseus.com", "electronics"),
      prod("c", "Cable costume", 8, "costumes.com", "apparel-accessories"),
      prod("d", "Pricey cable", 45, "dell.com", "electronics"),
    ],
  );
  const out = await run("usb c cable");
  const search = calls.find((c) => c.url.includes("trychannel3")).body;
  assert.equal(search.filters.price.max_price, 30);
  const pickPrompt = calls.filter((c) => c.url.endsWith("/chat/completions"))[1].body.messages[1].content;
  assert.ok(!pickPrompt.includes("costume") && !pickPrompt.includes("Pricey"));
  assert.deepEqual(out.products.map((p) => p.product_id), ["b", "a"]);
  assert.equal(out.products[0].image, "https://img.test/b.png");
  assert.equal(out.products[0].merchant, "baseus.com");
});

test("explains when nothing fits the rules", async () => {
  fake({ search: true, query: "office chair", quantity: 1 }, null, [prod("f", "Office Chair", 25, "overstock.com", "furniture")]);
  const out = await run("office chair");
  assert.equal(out.products.length, 0);
  assert.match(out.reply, /none fit your spending rules: they're in furniture/);
  const storeOnly: Rule[] = [{ categories: ["furniture"], merchants: ["ikea.com"], remaining: "30.00", currency: "USD" }];
  fake({ search: true, query: "office chair", quantity: 1 }, null, [prod("f", "Office Chair", 25, "overstock.com", "furniture")]);
  assert.match((await run("office chair", storeOnly)).reply, /from stores your rules don't allow/);
});

test("no budget left means no search", async () => {
  fake({ search: true, query: "cable", quantity: 1 }, null, []);
  const out = await run("cable", [{ ...rules[0], remaining: "0.00" }]);
  assert.match(out.reply, /budget is used up/);
  assert.ok(!calls.some((c) => c.url.includes("trychannel3")));
});
