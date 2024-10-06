document.getElementById('uploadForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData();
    const files = document.getElementById('file').files;

    if (files.length === 0) {
        document.getElementById('message').innerHTML = 'Please select a file to upload.';
        return;
    }

    for (let file of files) {
        formData.append('files', file);
    }

    // Clear previous messages and show progress bar
    document.getElementById('message').innerHTML = '';
    document.getElementById('progressContainer').style.display = 'block';
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    // Use XMLHttpRequest for better control over the upload progress
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/upload', true);

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
        if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);
            document.getElementById('message').innerHTML = `
                <div class="card">
                    Files uploaded successfully! Unique Code: <strong>${data.uniqueCode}</strong>
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
        document.getElementById('message').innerHTML = `Error: An error occurred during the file upload.`;
        document.getElementById('progressContainer').style.display = 'none';
    };

    // Send the form data (files)
    xhr.send(formData);
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
            document.getElementById('message').innerHTML = `<h3>Files found:</h3><ul id="fileList"></ul>`;

            data.files.forEach(file => {
                const fileItem = document.createElement('li');

                // Create the download link for each file
                const downloadLink = document.createElement('a');
                downloadLink.href = `/download/${file.id}`;
                downloadLink.textContent = `Download ${file.filename}`;
                downloadLink.className = 'download-link'; 

                // Create the delete button for each file
                const deleteButton = document.createElement('button');
                deleteButton.textContent = 'Delete';
                deleteButton.className = 'delete-button'; // Adding class for styling
                deleteButton.onclick = async () => {
                    const confirmDelete = confirm(`Are you sure you want to delete ${file.filename}?`);
                    if (confirmDelete) {
                        try {
                            const deleteResponse = await fetch(`/delete/${file.id}`, { method: 'DELETE' });
                            if (deleteResponse.ok) {
                                fileItem.remove();  // Remove the file entry from the list
                                alert(`${file.filename} deleted successfully!`);
                            } else {
                                alert('Error deleting file');
                            }
                        } catch (err) {
                            console.error('Error deleting file:', err);
                            alert('Error deleting file');
                        }
                    }
                };

                // Append download link and delete button to the list item
                fileItem.appendChild(downloadLink);
                fileItem.appendChild(deleteButton);
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
