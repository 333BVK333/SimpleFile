const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const { GridFSBucket } = require('mongodb');
const cron = require('node-cron');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// MongoDB connection
const mongoURI = process.env.MONGO_URL; // You can replace this with process.env.MONGO_URL if using .env
const conn = mongoose.createConnection(mongoURI);

let gridFSBucket;
conn.once('open', () => {
    gridFSBucket = new GridFSBucket(conn.db, {
        bucketName: 'uploads'
    });
    console.log('Connected to MongoDB and GridFSBucket initialized');
});

// Multer storage using memoryStorage
const storage = multer.memoryStorage(); // Files are stored in memory
const upload = multer({ storage }).array('files');

// Helper to generate a 6-digit unique code
const generateUniqueCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
};

// Route to upload files and generate unique code
app.post('/upload', (req, res) => {
    const uniqueCode = generateUniqueCode(); // Generate the unique code early
    res.json({ uniqueCode }); // Send unique code to client first
});

// New route to handle file upload after receiving the unique code
app.post('/uploadWithCode/:uniqueCode', (req, res) => {
    const uniqueCode = req.params.uniqueCode; // Get the unique code from the request

    upload(req, res, async (err) => {
        if (err) {
            console.error('Error during file upload:', err);
            return res.status(500).json({ message: 'Error during file upload', error: err });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files were uploaded.' });
        }

        try {
            const fileUploads = req.files.map((file) => {
                return new Promise((resolve, reject) => {
                    const uploadStream = gridFSBucket.openUploadStream(file.originalname, {
                        metadata: {
                            uniqueCode: uniqueCode,
                            uploadDate: new Date(), // Add the upload date to the metadata
                        },
                    });

                    uploadStream.end(file.buffer);

                    uploadStream.on('error', (streamErr) => {
                        console.error('Stream error during file upload:', streamErr);
                        reject(streamErr);
                    });

                    uploadStream.on('finish', () => {
                        resolve(file.originalname);
                    });
                });
            });

            await Promise.all(fileUploads);

            // Send confirmation after successful uploads
            res.json({ uniqueCode: uniqueCode, message: 'Files uploaded successfully!' });

        } catch (uploadErr) {
            console.error('Error handling file upload promises:', uploadErr);
            res.status(500).json({ message: 'Error during file upload', error: uploadErr });
        }
    });
});

// Route to delete files by unique code
// Route to delete files by unique code
app.post('/deleteByUniqueCode', async (req, res) => {
    const { uniqueCode } = req.body; // Expecting uniqueCode in the request body
    console.log('Received request to delete by unique code:', req.body);

    console.log(uniqueCode);

    if (!uniqueCode) {
        return res.status(400).json({ message: 'Unique code is required.' });
    }

    try {
        // Find all files with the given unique code
        const files = await gridFSBucket.find({ 'metadata.uniqueCode': uniqueCode }).toArray();

        if (files.length === 0) {
            return res.status(404).json({ message: 'No files found with the given unique code.' });
        }

        // Delete each file using its _id
        for (const file of files) {
            await gridFSBucket.delete(file._id); // Delete the file by its _id
        }

        res.json({ message: 'Partial uploads deleted successfully.' });
    } catch (err) {
        console.error('Error deleting files by unique code:', err);
        res.status(500).json({ message: 'Error deleting partial uploads.', error: err });
    }
});

// Search route to fetch all files by unique code
app.post('/search', async (req, res) => {
    const uniqueCode = req.body.uniqueCode;

    if (!uniqueCode) {
        return res.status(400).json({ message: 'Unique code is required!' });
    }

    try {
        const files = await gridFSBucket.find({ 'metadata.uniqueCode': uniqueCode }).toArray();

        if (!files || files.length === 0) {
            return res.status(404).json({ message: 'Files not found!' });
        }

        // Return list of filenames and IDs to the client to download individually
        const fileData = files.map(file => ({
            filename: file.filename,
            id: file._id
        }));

        res.json({ files: fileData });
    } catch (err) {
        res.status(500).json({ message: 'Error searching files', error: err });
    }
});

// Route to download an individual file by ID
app.get('/download/:id', async (req, res) => {
    const fileId = req.params.id;
    console.log('Download request for file ID:', fileId);

    try {
        // Fetch the file from GridFS by ID
        const file = await gridFSBucket.find({ _id: new mongoose.Types.ObjectId(fileId) }).toArray();

        if (!file || file.length === 0) {
            console.error('File not found in database for ID:', fileId);
            return res.status(404).json({ message: 'File not found!' });
        }

        const fileData = file[0];

        // Set headers
        res.set('Content-Type', fileData.contentType || 'application/octet-stream');
        res.set('Content-Disposition', `attachment; filename="${fileData.filename}"`);

        // Set the Content-Length header using file size from metadata
        if (fileData.length) {
            res.set('Content-Length', fileData.length);
        }

        // Create a read stream from GridFS
        const readStream = gridFSBucket.openDownloadStream(fileData._id);

        readStream.on('error', (error) => {
            console.error('Error while reading the file:', error);
            return res.status(500).json({ message: 'Error downloading file', error: error });
        });

        // Pipe the file content to the response
        readStream.pipe(res);
    } catch (err) {
        console.error('Error during download:', err);
        return res.status(500).json({ message: 'Error downloading file', error: err });
    }
});

// Background job to delete files older than 6 hours
cron.schedule('0 * * * *', async () => { // Runs every hour
    console.log('Running cleanup task to delete files older than 6 hours');

    try {
        const currentTime = new Date();
        const files = await gridFSBucket.find({}).toArray();

        files.forEach((file) => {
            const fileAgeInHours = (currentTime - new Date(file.metadata.uploadDate)) / (1000 * 60 * 60);

            if (fileAgeInHours > 6) { // Delete files older than 6 hours
                gridFSBucket.delete(file._id, (err) => {
                    if (err) {
                        console.error('Error deleting file:', err);
                    } else {
                        console.log(`Deleted file: ${file.filename}`);
                    }
                });
            }
        });
    } catch (err) {
        console.error('Error during cleanup:', err);
    }
});

// Route to delete an individual file by ID
app.delete('/delete/:id', async (req, res) => {
    const fileId = req.params.id;

    try {
        await gridFSBucket.delete(new mongoose.Types.ObjectId(fileId));
        res.json({ message: 'File deleted successfully!' });
    } catch (err) {
        console.error('Error deleting file:', err);
        res.status(500).json({ message: 'Error deleting file', error: err });
    }
});

// Serve HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/upload', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'upload.html'));
});

app.get('/search', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'search.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
