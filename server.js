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
const mongoURI = process.env.MONGO_URL;
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
    return Math.floor(100000 + Math.random() * 900000).toString();  // 6-digit code
};

// Upload route for multiple files
app.post('/upload', (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            console.error('Error during file upload:', err);
            return res.status(500).json({ message: 'Error uploading files', error: err });
        }

        try {
            const uniqueCode = generateUniqueCode();
            const fileUploads = req.files.map((file) => {
                return new Promise((resolve, reject) => {
                    const uploadStream = gridFSBucket.openUploadStream(file.originalname, {
                        metadata: {
                            uniqueCode: uniqueCode,
                            uploadDate: new Date(),  // Add the upload date to the metadata
                        },
                    });

                    // Pipe the file buffer directly to GridFSBucket
                    const readStream = file.stream;
                    uploadStream.end(file.buffer); // Use buffer for memory-based upload

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

            return res.json({ message: 'Files uploaded successfully!', uniqueCode: uniqueCode });
        } catch (uploadErr) {
            console.error('Error handling file upload promises:', uploadErr);
            return res.status(500).json({ message: 'Error uploading files', error: uploadErr });
        }
    });
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
        const file = await gridFSBucket.find({ _id: new mongoose.Types.ObjectId(fileId) }).toArray();

        if (!file || file.length === 0) {
            console.error('File not found in database for ID:', fileId);
            return res.status(404).json({ message: 'File not found!' });
        }

        const readStream = gridFSBucket.openDownloadStream(file[0]._id);
        res.set('Content-Type', file[0].contentType || 'application/octet-stream');
        res.set('Content-Disposition', `attachment; filename="${file[0].filename}"`);
        
        readStream.on('error', (error) => {
            console.error('Error while reading the file:', error);
            return res.status(500).json({ message: 'Error downloading file', error: error });
        });
        
        readStream.pipe(res);
    } catch (err) {
        console.error('Error during download:', err);
        return res.status(500).json({ message: 'Error downloading file', error: err });
    }
});

// Background job to delete files older than 6 hours
cron.schedule('0 * * * *', async () => {  // Runs every hour
    console.log('Running cleanup task to delete files older than 6 hours');
    
    try {
        const currentTime = new Date();
        const files = await gridFSBucket.find({}).toArray();

        files.forEach((file) => {
            const fileAgeInHours = (currentTime - new Date(file.metadata.uploadDate)) / (1000 * 60 * 60);
            
            if (fileAgeInHours > 6) {  // Delete files older than 6 hours
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
