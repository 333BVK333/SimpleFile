// Handle file upload
document.getElementById('uploadForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData();
    const files = document.getElementById('file').files;

    console.log(files)

    if (files.length === 0) {
        document.getElementById('message').innerHTML = 'Please select a file to upload.';
        return;
    }

    for (let file of files) {
        formData.append('files', file);
    }

    console.log(formData)

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message);
        }

        const data = await response.json();

        document.getElementById('message').innerHTML = `
            <div class="card">
                Files uploaded successfully! Unique Code: <strong>${data.uniqueCode}</strong>
            </div>
        `;
    } catch (error) {
        console.error('Error uploading files:', error);
        document.getElementById('message').innerHTML = `Error: ${error.message}`;
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
