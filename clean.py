import os

base_dir = r"A:\AIProjects\VAD_FullStack"

files_to_fix = [
    "backend/Dockerfile",
    "backend/package.json",
    "backend/server.js",
    "worker_gpu/Dockerfile",
    "worker_gpu/requirements.txt",
    "worker_gpu/main.py",
    "worker_cpu/Dockerfile",
    "worker_cpu/requirements.txt",
    "worker_cpu/main.py"
]

for filepath in files_to_fix:
    full_path = os.path.join(base_dir, filepath)
    if os.path.exists(full_path):
        with open(full_path, "r") as f:
            content = f.read()
        
        # Remove literal \n if it exists at the very end
        if content.endswith("\\n\n"):
            content = content[:-3] + "\n"
        elif content.endswith("\\n"):
            content = content[:-2]
            
        with open(full_path, "w") as f:
            f.write(content)

print("Files cleaned!")
