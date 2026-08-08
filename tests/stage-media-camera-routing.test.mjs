import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("uploaded Stage media is exposed to every live camera source selector", async () => {
  const deck = await readFile(new URL("../src/StageProgramMediaDeck.tsx", import.meta.url), "utf8");
  const stage = await readFile(new URL("../src/pages/stage.tsx", import.meta.url), "utf8");
  assert.match(deck, /onLibraryChange\?\.\(library\)/);
  assert.match(stage, /onLibraryChange=\{setVideoLibrary\}/);
  assert.match(stage, /videoLibrary\.map\(\(asset\)/);
  assert.match(stage, /value=\{`media:\$\{asset\.id\}`\}/);
  assert.match(stage, /MEDIA \/ \{asset\.name\}/);
});

test("taking a camera routed to media sends that asset to program", async () => {
  const stage = await readFile(new URL("../src/pages/stage.tsx", import.meta.url), "utf8");
  assert.match(stage, /const mediaAsset = channel\?\.mediaAsset/);
  assert.match(stage, /programMedia: \{ \.\.\.production\.state\.programMedia, url: mediaAsset\.url/);
  assert.match(stage, /VIRTUAL SHOT \/ 3D VENUE/);
});
