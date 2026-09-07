const express = require('express');
const { router: skinRouter } = require('./autosecure/utils/imageHandler/skinServer');

// Setup express for skin serving
const app = express();
app.use('/skins', skinRouter);

// Start the server
const PORT = process.env.SKIN_SERVER_PORT || 3032;
app.listen(PORT, () => {
    console.log(`Skin server listening on port ${PORT}`);
});