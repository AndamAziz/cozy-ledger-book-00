path = "/var/www/cozy-ledger/src/lib/tvMode.ts"
with open(path, "r") as f:
    code = f.read()

# لێرەدا قەبارەی استاش و بفر کەم دەکەینەوە بۆ ئەوەی خێرا دەست پێبکات
old_config = "export function mpegtsConfigFor("
new_config = """export function mpegtsConfigFor(tv = isTvMode()) {
  return {
    enableStash: false,
    stashInitialSize: 0,
    liveBufferLatencyChasing: true,
    liveSyncMaxLatency: 1.5,
    liveMaxLatencyDuration: 3,
    autoCleanupSourceBuffer: true,
  };
}
// Old config was:
/*
export function mpegtsConfigFor("""

if "enableStash" not in code:
    # ئەگەر پێشتر نەبوو، ڕاستەوخۆ فەنکشنەکە دەگۆڕین
    import re
    code = re.sub(r'export function mpegtsConfigFor\([^)]*\)\s*\{[^}]*\}', '''export function mpegtsConfigFor(tv = isTvMode()) {
  return {
    enableStash: false,
    stashInitialSize: 0,
    liveBufferLatencyChasing: true,
    liveSyncMaxLatency: 1.5,
    liveMaxLatencyDuration: 3,
    autoCleanupSourceBuffer: true,
  };
}''', code)
    with open(path, "w") as f:
        f.write(code)
    print("Successfully updated mpegts config for instant playback!")
else:
    print("Config already updated.")
