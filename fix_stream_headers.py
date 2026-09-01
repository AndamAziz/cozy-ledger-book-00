path = "/root/andam-stream/server.js"
with open(path, "r") as f:
    code = f.read()

# لێرەدا هێدەرەکانی بێ کش و کەپ-ئلایڤ زیاد دەکەین بۆ خێراکردنی ستریم
old_part = "res.setHeader('Accept-Ranges', 'bytes');\n  res.status(up.status);"
new_part = """res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.status(up.status);"""

if old_part in code and "Cache-Control" not in code:
    code = code.replace(old_part, new_part, 1)
    with open(path, "w") as f:
        f.write(code)
    print("Successfully added stream headers!")
else:
    print("Headers already exist or target not found.")
