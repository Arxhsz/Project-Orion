import subprocess
import time

def run_command(command):
    print(f"Running: {command}")
    subprocess.run(command, shell=True)

if __name__ == "__main__":
    run_command("taskkill /F /IM python.exe")
    
    time.sleep(3)

    run_command("taskkill /F /IM node.exe")
    
    time.sleep(3)
    
    run_command(r".\start-orion.ps1")
