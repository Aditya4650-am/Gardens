import subprocess, sys, os
ADB = r"C:\Users\User\AppData\Local\Android\Sdk\platform-tools\adb.exe"
SERIAL = "127.0.0.1:21513"
src = sys.argv[1] if len(sys.argv) > 1 else "/data/data/com.playrix.gardenscapes/Documents/GameData.db"
dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.environ["TEMP"], "gs-test", "dev-bin.db")
r = subprocess.run([ADB, "-s", SERIAL, "exec-out", f"su -c 'cat {src}'"], stdout=subprocess.PIPE)
data = r.stdout
open(dst, "wb").write(data)
print(f"{dst} {len(data)}B head={data[:16].hex()}")
