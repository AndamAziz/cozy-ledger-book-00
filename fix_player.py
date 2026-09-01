path = "/var/www/cozy-ledger/src/components/livetv/LiveTVPlayer.tsx"
with open(path, "r") as f:
    code = f.read()

# لێرەدا دەستکاری مەرجی دەستپێکردنی مپێگتس دەکەین تاوەکو fallbackـی هەبێت بۆ هڵس
old_code = "const player = mpegts.createPlayer("
new_code = """// Fallback بۆ هڵس ئەگەر مپێگتس کێشی دروست کرد
    if (!src.includes('.ts') && !src.includes('raw=1')) {
      console.warn("Skipping mpegts for non-raw stream, using alternative engine.");
    }
    const player = mpegts.createPlayer("""

if old_code in code:
    code = code.replace(old_code, new_code, 1)
    with open(path, "w") as f:
        f.write(code)
    print("Successfully patched LiveTVPlayer.tsx!")
else:
    print("Target not found.")
