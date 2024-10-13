let uploadController = null;  // AbortController for handling upload cancel
let currentUniqueCode = null;  // Store the unique code here
let isUploading = false;        // Track if upload is in progress

// Handle file upload
document.getElementById('uploadForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData();
    const files = document.getElementById('file').files;

    // AbortController setup to handle cancel
    uploadController = new AbortController();
    const signal = uploadController.signal;

    if (files.length === 0) {
        document.getElementById('message').innerHTML = 'Please select a file to upload.';
        return;
    }

    // Validate file sizes
    let totalSize = 0;
    for (let file of files) {
        totalSize += file.size;

        // Check if the single file exceeds 8MB
        if (files.length === 1 && file.size > 8 * 1024 * 1024) {
            document.getElementById('message').innerHTML = 'Each file must be less than 8MB.';
            return;
        }
    }

    // Check if total size exceeds 20MB for multiple files
    if (files.length > 1 && totalSize > 20 * 1024 * 1024) {
        document.getElementById('message').innerHTML = 'Total file size must be less than 20MB.';
        return;
    }

    // Append files to FormData for upload
    for (let file of files) {
        formData.append('files', file);
    }

    // Clear previous messages and show progress bar
    document.getElementById('message').innerHTML = '';
    document.getElementById('progressContainer').style.display = 'block';
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    try {
        // First, get the unique code from the server before uploading the file
        const uniqueCodeResponse = await fetch('/upload', {
            method: 'POST',
        });

        const uniqueCodeData = await uniqueCodeResponse.json();
        currentUniqueCode = uniqueCodeData.uniqueCode;  // Store unique code for later use
        isUploading = true;  // Set upload flag to true

        // Now, start the file upload with XMLHttpRequest for progress handling
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/uploadWithCode/${currentUniqueCode}`, true);  // Send the unique code with the upload request

        // Update the progress bar as the file is being uploaded
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                progressBar.value = percentComplete;  // Update progress bar
                progressText.textContent = `${percentComplete}% uploaded`;  // Update text
            }
        });

        // Handle the upload completion
        xhr.onload = () => {
            isUploading = false; // Reset upload flag
            if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);

                // Clear the file input field after successful upload
                document.getElementById('file').value = '';

                document.getElementById('message').innerHTML = `
                    <div class="card">
                        Files uploaded successfully! File Fetching Code (FFC): <strong>${data.uniqueCode}</strong>
                    </div>
                `;
            } else {
                document.getElementById('message').innerHTML = `Error: ${xhr.responseText}`;
            }

            // Hide the progress bar after completion
            document.getElementById('progressContainer').style.display = 'none';
        };

        // Handle errors during upload
        xhr.onerror = () => {
            isUploading = false; // Reset upload flag
            document.getElementById('message').innerHTML = `Error: An error occurred during the file upload.`;
            document.getElementById('progressContainer').style.display = 'none';
        };

        // Send the form data (files)
        xhr.send(formData);

    } catch (error) {
        console.error('Error fetching unique code or uploading files:', error);
    }
});

// Cancel upload functionality
document.getElementById('cancelUpload')?.addEventListener('click', async () => {
    if (uploadController) {
        uploadController.abort();  // Cancel the upload
        uploadController = null;   // Reset the controller
        isUploading = false;       // Reset upload flag
        document.getElementById('file').value = '';
        document.getElementById('message').innerHTML = 'Upload cancelled.';
        document.getElementById('progressContainer').style.display = 'none';  // Hide progress bar on cancel

        // If a unique code exists, delete the uploaded files using that code
        if (currentUniqueCode) {
            try {
                const deleteResponse = await fetch('/deleteByUniqueCode', {
                    method: 'POST', // Ensure we are using POST method
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uniqueCode: currentUniqueCode }),
                });

                if (deleteResponse.ok) {
                    alert('Partial uploads deleted successfully.');
                } else {
                    const errorData = await deleteResponse.json();
                    alert('Error deleting partial uploads: ' + errorData.message);
                }
            } catch (err) {
                console.error('Error deleting partial uploads:', err);
            }
        }

        // Do not display the unique code after cancellation
        currentUniqueCode = null; // Clear the unique code after cancellation
    }
});

// Handle file search and display download and delete options
document.getElementById('searchForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const uniqueCode = document.getElementById('uniqueCode').value;

    const response = await fetch('/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uniqueCode }),
    });

    if (response.ok) {
        const data = await response.json();

        if (data.files.length > 0) {
            document.getElementById('message').innerHTML = `<h3>Files Found:</h3><ul id="fileList"></ul>`;

            data.files.forEach(file => {
                const fileItem = document.createElement('li');

                // Create a container for file name, download and delete options
                const fileContainer = document.createElement('div');
                fileContainer.className = 'file-container';

                // Create a span for the file name
                const fileName = document.createElement('span');
                fileName.textContent = file.filename;
                fileName.className = 'file-name';

                // Create the download icon for the file
                const downloadIcon = document.createElement('img');
                downloadIcon.className = 'download-icon';
                downloadIcon.src = 'download.svg'; // Placeholder, replace with actual icon later
                downloadIcon.onclick = () => handleFileDownload(file.id, file.filename, downloadIcon); // Attach download functionality

                // Create the delete icon for the file
                const deleteIcon = document.createElement('img');
                deleteIcon.className = 'delete-icon';
                deleteIcon.src = 'delete.svg'; // Placeholder, replace with actual icon later
                deleteIcon.onclick = () => handleFileDelete(file.id, fileItem, file.filename); // Attach delete functionality

                // Append file name, download and delete icons to the container
                fileContainer.appendChild(fileName);
                fileContainer.appendChild(downloadIcon);
                fileContainer.appendChild(deleteIcon);

                // Append the file container to the list item
                fileItem.appendChild(fileContainer);
                document.getElementById('fileList').appendChild(fileItem);
            });
        } else {
            document.getElementById('message').textContent = 'No files found for this unique code.';
        }
    } else {
        const data = await response.json();
        document.getElementById('message').textContent = data.message;
    }
});

// Add a variable to store the download controller
let downloadController = null; 

async function handleFileDownload(fileId, fileName, downloadIcon) {
    // Check if a download is already in progress
    if (downloadController) {
        // Cancel the download if it's already in progress
        downloadController.abort();
        downloadController = null; // Reset the controller
        downloadIcon.src = 'download.svg'; // Change icon back to download
        return; // Exit the function
    }

    // Set up the AbortController for the download
    downloadController = new AbortController();
    const signal = downloadController.signal;

    // Create a circular progress bar and attach it near the download icon
    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-circle';
    const progressText = document.createElement('span');
    progressText.className = 'progress-text';
    progressText.textContent = '0%';
    progressContainer.appendChild(progressText);
    downloadIcon.parentNode.appendChild(progressContainer); // Append progress near the download icon

    // Change the download icon to cancel icon
    downloadIcon.src = 'cancel.svg'; // Change to cancel icon

    try {
        // Fetch the file in chunks to monitor progress
        const response = await fetch(`/download/${fileId}`, { signal });

        if (!response.ok) {
            throw new Error('Failed to download file');
        }

        const contentLength = response.headers.get('Content-Length');
        if (!contentLength) {
            throw new Error('Content-Length response header is missing');
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

            // Calculate percentage and update the circular progress bar
            const percentComplete = Math.round((receivedBytes / totalBytes) * 100);
            progressText.textContent = `${percentComplete}%`;
            progressContainer.style.background = `conic-gradient(#4CAF50 ${percentComplete * 3.6}deg, #ddd 0deg)`;
        }

        // Once download is complete, create a Blob and trigger the download
        const blob = new Blob(chunks);
        const blobUrl = URL.createObjectURL(blob);

        // Create a temporary link element to download the file
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a); // Remove the link after triggering download

        // Remove the progress circle once the download is complete
        progressText.textContent = '100%';
        setTimeout(() => {
            progressContainer.remove();
            downloadIcon.src = 'download.svg'; // Change back to download icon
            downloadController = null; // Reset the controller
        }, 1000);
        
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Download canceled.');
            alert('Download canceled.');
        } else {
            console.error('Error during file download:', error);
            alert('Error downloading file.');
        }
        // Clean up and revert the icon
        progressContainer.remove();
        downloadIcon.src = 'download.svg'; // Change back to download icon
        downloadController = null; // Reset the controller
    }
}

// Handle file deletion
async function handleFileDelete(fileId, fileItem, fileName) {
    const confirmDelete = confirm(`Are you sure you want to delete ${fileName}?`);
    if (confirmDelete) {
        try {
            const deleteResponse = await fetch(`/delete/${fileId}`, { method: 'DELETE' });
            if (deleteResponse.ok) {
                fileItem.remove();  // Remove the file entry from the list
                alert(`${fileName} deleted successfully!`);
            } else {
                alert('Error deleting file');
            }
        } catch (err) {
            console.error('Error deleting file:', err);
            alert('Error deleting file');
        }
    }
}
