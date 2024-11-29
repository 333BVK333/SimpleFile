
let uploadController = null; 
let currentUniqueCode = null; 
let isUploading = false; 

document.getElementById("uploadForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const formData = new FormData();
  const files = document.getElementById("file").files;

  uploadController = new AbortController();
  const signal = uploadController.signal;

  if (files.length === 0) {
    document.getElementById("message").innerHTML =
      "Please select a file to upload.";
    return;
  }

  let totalSize = 0;
  for (let file of files) {
    totalSize += file.size;

    if (files.length === 1 && file.size > 8 * 1024 * 1024) {
      document.getElementById("message").innerHTML =
        "Each file must be less than 8MB.";
      return;
    }
  }

  if (files.length > 1 && totalSize > 20 * 1024 * 1024) {
    document.getElementById("message").innerHTML =
      "Total file size must be less than 20MB.";
    return;
  }

  for (let file of files) {
    formData.append("files", file);
  }

  document.getElementById("message").innerHTML = "";
  document.getElementById("progressContainer").style.display = "block";
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");

  try {
    const uniqueCodeResponse = await fetch("/upload", {
      method: "POST",
    });

    const uniqueCodeData = await uniqueCodeResponse.json();
    currentUniqueCode = uniqueCodeData.uniqueCode; 
    isUploading = true; 

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/uploadWithCode/${currentUniqueCode}`, true); 

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        progressBar.value = percentComplete; 
        progressText.textContent = `${percentComplete}% uploaded`; 
      }
    });

    xhr.onload = () => {
      isUploading = false;
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        document.getElementById("file").value = "";
        document.getElementById("message").innerHTML = `
            <div class="card">
                Files uploaded successfully! File Fetching Code (FFC): 
                <strong id="ffc">${data.uniqueCode}</strong><button id="copyButton" onclick="copyToClipboard()">Copy</button>
            </div>
                `;
      } else {
        document.getElementById(
          "message"
        ).innerHTML = `Error: ${xhr.responseText}`;
      }

      document.getElementById("progressContainer").style.display = "none";
    };

    xhr.onerror = () => {
      isUploading = false; 
      document.getElementById(
        "message"
      ).innerHTML = `Error: An error occurred during the file upload.`;
      document.getElementById("progressContainer").style.display = "none";
    };

    xhr.send(formData);
  } catch (error) {
    console.error("Error fetching unique code or uploading files:", error);
  }
});

function copyToClipboard() {
  const ffc = document.getElementById("ffc").textContent;
  const copyButton = document.getElementById("copyButton");

  navigator.clipboard
    .writeText(ffc)
    .then(() => {
      copyButton.textContent = "Copied!";
      setTimeout(() => {
        copyButton.textContent = "Copy";
      }, 1000);
    })
    .catch((err) => {
      console.error("Failed to copy the code:", err);
    });
}

document.getElementById("cancelUpload")?.addEventListener("click", async () => {
  if (uploadController) {
    uploadController.abort(); 
    uploadController = null; 
    isUploading = false; 
    document.getElementById("file").value = "";
    document.getElementById("message").innerHTML = "Upload cancelled.";
    document.getElementById("progressContainer").style.display = "none"; 

    if (currentUniqueCode) {
      try {
        const deleteResponse = await fetch("/deleteByUniqueCode", {
          method: "POST", 
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uniqueCode: currentUniqueCode }),
        });

        if (deleteResponse.ok) {
          alert("Partial uploads deleted successfully.");
        } else {
          const errorData = await deleteResponse.json();
          alert("Error deleting partial uploads: " + errorData.message);
        }
      } catch (err) {
        console.error("Error deleting partial uploads:", err);
      }
    }

    currentUniqueCode = null;
  }
});

document.getElementById("searchForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const uniqueCode = document.getElementById("uniqueCode").value;

  const response = await fetch("/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uniqueCode }),
  });

  if (response.ok) {
    const data = await response.json();

    if (data.files.length > 0) {
      document.getElementById(
        "message"
      ).innerHTML = `<h3>Files Found:</h3><ul id="fileList"></ul>`;

      data.files.forEach((file) => {
        const fileItem = document.createElement("li");

        const fileContainer = document.createElement("div");
        fileContainer.className = "file-container";

        const fileName = document.createElement("span");
        fileName.textContent = file.filename;
        fileName.className = "file-name";

        const downloadIcon = document.createElement("img");
        downloadIcon.className = "download-icon";
        downloadIcon.src = "download.svg"; 
        downloadIcon.onclick = () =>
          handleFileDownload(file.id, file.filename, downloadIcon); 

        const deleteIcon = document.createElement("img");
        deleteIcon.className = "delete-icon";
        deleteIcon.src = "delete.svg"; 
        deleteIcon.onclick = () =>
          handleFileDelete(file.id, fileItem, file.filename); 

        fileContainer.appendChild(fileName);
        fileContainer.appendChild(downloadIcon);
        fileContainer.appendChild(deleteIcon);

        fileItem.appendChild(fileContainer);
        document.getElementById("fileList").appendChild(fileItem);
      });
    } else {
      document.getElementById("message").textContent =
        "No files found for this unique code.";
    }
  } else {
    const data = await response.json();
    document.getElementById("message").textContent = data.message;
  }
});

let downloadController = null;

async function handleFileDownload(fileId, fileName, downloadIcon) {
  if (downloadController) {
    downloadController.abort();
    downloadController = null; 
    downloadIcon.src = "download.svg"; 
    return; 
  }

  downloadController = new AbortController();
  const signal = downloadController.signal;

  const progressContainer = document.createElement("div");
  progressContainer.className = "progress-circle";
  const progressText = document.createElement("span");
  progressText.className = "progress-text";
  progressText.textContent = "0%";
  progressContainer.appendChild(progressText);
  downloadIcon.parentNode.appendChild(progressContainer); 

  downloadIcon.src = "cancel.svg"; 

  try {
    const response = await fetch(`/download/${fileId}`, { signal });

    if (!response.ok) {
      throw new Error("Failed to download file");
    }

    const contentLength = response.headers.get("Content-Length");
    if (!contentLength) {
      throw new Error("Content-Length response header is missing");
    }

    const totalBytes = parseInt(contentLength, 10);
    let receivedBytes = 0;

    const reader = response.body.getReader();
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      receivedBytes += value.length;

      const percentComplete = Math.round((receivedBytes / totalBytes) * 100);
      progressText.textContent = `${percentComplete}%`;
      progressContainer.style.background = `conic-gradient(#4CAF50 ${
        percentComplete * 3.6
      }deg, #ddd 0deg)`;
    }

    const blob = new Blob(chunks);
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a); 

    progressText.textContent = "100%";
    setTimeout(() => {
      progressContainer.remove();
      downloadIcon.src = "download.svg"; 
      downloadController = null; 
    }, 1000);
  } catch (error) {
    if (error.name === "AbortError") {
      console.log("Download canceled.");
      alert("Download canceled.");
    } else {
      console.error("Error during file download:", error);
      alert("Error downloading file.");
    }
    progressContainer.remove();
    downloadIcon.src = "download.svg"; 
    downloadController = null; 
  }
}

async function handleFileDelete(fileId, fileItem, fileName) {
  const confirmDelete = confirm(`Are you sure you want to delete ${fileName}?`);
  if (confirmDelete) {
    try {
      const deleteResponse = await fetch(`/delete/${fileId}`, {
        method: "DELETE",
      });
      if (deleteResponse.ok) {
        fileItem.remove(); 
        alert(`${fileName} deleted successfully!`);
      } else {
        alert("Error deleting file");
      }
    } catch (err) {
      console.error("Error deleting file:", err);
      alert("Error deleting file");
    }
  }
}
