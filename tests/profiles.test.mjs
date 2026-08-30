import test from "node:test";
import assert from "node:assert/strict";
import { compileBuiltInProfiles, compileProfile, getProfileDefinition, ProfileValidationError } from "../dist-test/src/profiles.js";

test("built-in profiles compile into immutable hashed operating contracts", async () => {
  const profiles = await compileBuiltInProfiles();
  assert.equal(profiles.size, 4);
  assert.equal(profiles.get("general").planningDimensions.money, "unknown");
  for (const [profileId, profile] of profiles) {
    assert.equal(profile.profileId, profileId);
    assert.match(profile.profileHash, /^[a-f0-9]{64}$/);
    assert.equal(Object.isFrozen(profile), true);
    assert.equal(Object.isFrozen(profile.entities), true);
    assert.equal(Object.isFrozen(profile.surface), true);
    assert.equal(profile.contextualCapabilities.every((name) => name.startsWith(`${profileId}_`)), true);
  }
});

test("profile compiler refuses allocation, relationship, and contextual drift", async () => {
  const invalid = getProfileDefinition("event");
  invalid.accepted.bufferMinor += 1;
  invalid.relationships[0].right.entityId = "missing_venue";
  invalid.contextualCapabilities[0] = "travel_wrong_station";
  invalid.surface.timeModel = "calendar";
  await assert.rejects(
    () => compileProfile(invalid),
    (error) => error instanceof ProfileValidationError
      && error.issues.some((issue) => issue.includes("conserve"))
      && error.issues.some((issue) => issue.includes("missing entity"))
      && error.issues.some((issue) => issue.includes("prefix"))
      && error.issues.some((issue) => issue.includes("time model")),
  );
});
