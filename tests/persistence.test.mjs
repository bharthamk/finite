import test from "node:test";
import assert from "node:assert/strict";
import { clearForeignFiniteScopes, MemoryStorage, PlanCatalogStore, ScopedStorage } from "../dist-test/src/persistence.js";

test("browser persistence is account-scoped even when identities share one origin", () => {
  const browser = new MemoryStorage();
  const accountA = new ScopedStorage(browser, "user_aaaaaaaaaaaaaaaa");
  const accountB = new ScopedStorage(browser, "user_bbbbbbbbbbbbbbbb");
  const catalogA = new PlanCatalogStore(accountA);
  const catalogB = new PlanCatalogStore(accountB);

  accountA.setItem("finite-plan.surface.active-profile", "plan_private_a");
  catalogA.save({ planId: "plan_private_a", profileId: "travel" }, []);
  browser.setItem("finite-plan.surface.active-profile", "legacy_origin_global_value");

  assert.equal(accountA.getItem("finite-plan.surface.active-profile"), "plan_private_a");
  assert.equal(accountB.getItem("finite-plan.surface.active-profile"), null);
  assert.equal(catalogA.load()[0].definition.planId, "plan_private_a");
  assert.deepEqual(catalogB.load(), []);

  accountB.setItem("finite-plan.surface.active-profile", "plan_private_b");
  assert.equal(accountA.getItem("finite-plan.surface.active-profile"), "plan_private_a");
  assert.equal(accountB.getItem("finite-plan.surface.active-profile"), "plan_private_b");
});

test("storage scopes reject empty, broad, or path-shaped namespace input", () => {
  const browser = new MemoryStorage();
  for (const scope of ["", "user", "../owner", "user:owner", "a".repeat(101)]) {
    assert.throws(() => new ScopedStorage(browser, scope), /bounded opaque storage scope/);
  }
});

test("shared-browser startup removes foreign Finite caches without touching unrelated origin data", () => {
  const browser = new MemoryStorage();
  const accountA = new ScopedStorage(browser, "user_aaaaaaaaaaaaaaaa");
  const accountB = new ScopedStorage(browser, "user_bbbbbbbbbbbbbbbb");
  accountA.setItem("finite-plan.catalog.v1", "private-a");
  accountB.setItem("finite-plan.catalog.v1", "private-b");
  browser.setItem("unrelated-app-key", "preserve-me");

  assert.equal(clearForeignFiniteScopes(browser, "user_bbbbbbbbbbbbbbbb"), 1);
  assert.equal(accountA.getItem("finite-plan.catalog.v1"), null);
  assert.equal(accountB.getItem("finite-plan.catalog.v1"), "private-b");
  assert.equal(browser.getItem("unrelated-app-key"), "preserve-me");
});
