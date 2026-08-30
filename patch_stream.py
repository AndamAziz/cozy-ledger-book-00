path = "/var/www/cozy-ledger/supabase/functions/iptv-stream/index.ts"
with open(path, "r") as f:
    code = f.read()

old_target = 'const m = /"container_extension"\\s*:\\s*"([a-z0-9]{2,5})"/i.exec(text)'
new_target = '''let m = /"container_extension"\\s*:\\s*"([a-z0-9]{2,5})"/i.exec(text);
      let ext = m ? m[1].toLowerCase() : "ts";
      if (ext === "m3u8" || !ext) ext = "ts";'''

if old_target in code:
    code = code.replace(old_target, new_target)
    with open(path, "w") as f:
        f.write(code)
    print("Successfully patched iptv-stream/index.ts!")
else:
    print("Target pattern not found, checking alternative...")
