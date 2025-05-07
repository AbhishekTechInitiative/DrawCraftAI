const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const FormData = require('form-data');
const { Readable } = require('stream');
const busboy = require('busboy');

const app = express();

// Enable CORS for all routes
app.use(cors());

// Basic logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Set up routes for Clipdrop text-to-image API
app.post('/proxy/generate', async (req, res) => {
  try {
    const API_KEY = req.headers['x-api-key']; // Client should pass the API key in this header
    if (!API_KEY) {
      return res.status(401).json({ error: 'API key is required' });
    }

    const bb = busboy({ headers: req.headers });
    let prompt = '';

    // Parse the form data from the request
    bb.on('field', (name, val) => {
      if (name === 'prompt') {
        prompt = val;
      }
    });

    bb.on('finish', async () => {
      try {
        if (!prompt) {
          return res.status(400).json({ error: 'Prompt is required' });
        }

        console.log('Creating text-to-image with prompt:', prompt);
        
        // Create FormData for the Clipdrop API
        const form = new FormData();
        form.append('prompt', prompt);

        console.log('Sending request to Clipdrop API...');
        
        // Make the request to Clipdrop API
        const response = await fetch('https://clipdrop-api.co/text-to-image/v1', {
          method: 'POST',
          headers: {
            'x-api-key': API_KEY
          },
          body: form
        });

        console.log('Response status:', response.status);
        console.log('Response content-type:', response.headers.get('content-type'));

        if (!response.ok) {
          let errorMsg = 'Failed to generate image';
          try {
            // Try to get error details if available
            const errorText = await response.text();
            console.error('Error response from Clipdrop API:', errorText);
            errorMsg = errorText;
          } catch (e) {
            console.error('Could not parse error response:', e);
          }
          
          return res.status(response.status).json({ 
            error: 'Error from Clipdrop API', 
            details: errorMsg,
            status: response.status
          });
        }

        // Clipdrop returns the image directly, not JSON data
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('image')) {
          // Get image as buffer
          const imageBuffer = await response.buffer();
          
          // Convert to base64 for easy handling in the frontend
          const base64Image = imageBuffer.toString('base64');
          
          // Return as JSON with base64 image
          res.json({
            success: true,
            image: base64Image
          });
        } else {
          // Unexpected response type
          const text = await response.text();
          console.error('Unexpected response from Clipdrop API:', text);
          res.status(502).json({
            error: 'Unexpected response type from Clipdrop API',
            details: text
          });
        }
      } catch (error) {
        console.error('Error processing image generation:', error);
        res.status(500).json({ error: 'Failed to process request', details: error.message });
      }
    });

    req.pipe(bb);
  } catch (error) {
    console.error('Error handling proxy request:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Set up route for Clipdrop reimagine API
app.post('/proxy/reimagine', async (req, res) => {
  try {
    const API_KEY = req.headers['x-api-key']; // Client should pass the API key in this header
    if (!API_KEY) {
      return res.status(401).json({ error: 'API key is required' });
    }

    const bb = busboy({ headers: req.headers });
    let imageBuffer = null;
    
    // Parse the form data from the request
    bb.on('file', (name, file, info) => {
      if (name === 'image_file') {
        const chunks = [];
        file.on('data', (chunk) => {
          chunks.push(chunk);
        });
        file.on('end', () => {
          imageBuffer = Buffer.concat(chunks);
        });
      }
    });

    bb.on('finish', async () => {
      try {
        if (!imageBuffer) {
          return res.status(400).json({ error: 'Image file is required' });
        }

        console.log('Reimagining image, buffer size:', imageBuffer.length);
        
        // Create FormData for the Clipdrop API
        const form = new FormData();
        form.append('image_file', new Readable({
          read() {
            this.push(imageBuffer);
            this.push(null);
          }
        }), {
          filename: 'image.jpg',
          contentType: 'image/jpeg'
        });

        console.log('Sending request to Clipdrop Reimagine API...');
        
        // Make the request to Clipdrop API
        const response = await fetch('https://clipdrop-api.co/reimagine/v1/reimagine', {
          method: 'POST',
          headers: {
            'x-api-key': API_KEY
          },
          body: form
        });

        console.log('Response status:', response.status);
        console.log('Response content-type:', response.headers.get('content-type'));

        if (!response.ok) {
          let errorMsg = 'Failed to reimagine image';
          try {
            // Try to get error details if available
            const errorText = await response.text();
            console.error('Error response from Clipdrop API:', errorText);
            errorMsg = errorText;
          } catch (e) {
            console.error('Could not parse error response:', e);
          }
          
          return res.status(response.status).json({ 
            error: 'Error from Clipdrop API', 
            details: errorMsg,
            status: response.status
          });
        }

        // Clipdrop returns the image directly, not JSON data
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('image')) {
          // Get image as buffer
          const reimaginedImageBuffer = await response.buffer();
          
          // Convert to base64 for easy handling in the frontend
          const base64Image = reimaginedImageBuffer.toString('base64');
          
          // Return as JSON with base64 image
          res.json({
            success: true,
            image: base64Image
          });
        } else {
          // Unexpected response type
          const text = await response.text();
          console.error('Unexpected response from Clipdrop API:', text);
          res.status(502).json({
            error: 'Unexpected response type from Clipdrop API',
            details: text
          });
        }
      } catch (error) {
        console.error('Error processing image reimagination:', error);
        res.status(500).json({ error: 'Failed to process request', details: error.message });
      }
    });

    req.pipe(bb);
  } catch (error) {
    console.error('Error handling proxy request:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Proxy route for status checks
app.get('/proxy/status/:processId', async (req, res) => {
  try {
    const { processId } = req.params;
    const API_KEY = req.headers['x-api-key'];
    
    if (!API_KEY) {
      return res.status(401).json({ error: 'API key is required' });
    }
    
    console.log(`Checking status for process: ${processId}`);
    console.log('Using authorization header:', `Bearer ${API_KEY}`);
    
    const response = await fetch(`https://api.monsterapi.ai/v1/status/${processId}`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });
    
    const responseData = await response.json();
    console.log(`Status response:`, JSON.stringify(responseData, null, 2));
    
    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Error from MonsterAPI status check',
        details: responseData,
        status: response.status
      });
    }
    
    res.json(responseData);
  } catch (error) {
    console.error('Error checking status:', error);
    res.status(500).json({ error: 'Failed to check status', details: error.message });
  }
});

// Proxy route for fetching results
app.get('/proxy/fetch/:processId', async (req, res) => {
  try {
    const { processId } = req.params;
    const API_KEY = req.headers['monster-api-key'];
    
    if (!API_KEY) {
      return res.status(401).json({ error: 'API key is required' });
    }
    
    console.log(`Fetching results for process: ${processId}`);
    console.log('Using authorization header:', `Bearer ${API_KEY}`);
    
    const response = await fetch(`https://api.monsterapi.ai/v1/fetch/${processId}`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });
    
    const responseData = await response.json();
    console.log(`Fetch response: ${JSON.stringify(responseData).slice(0, 200)}...`); // Truncate large responses
    
    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Error from MonsterAPI fetch',
        details: responseData,
        status: response.status
      });
    }
    
    res.json(responseData);
  } catch (error) {
    console.error('Error fetching results:', error);
    res.status(500).json({ error: 'Failed to fetch results', details: error.message });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
  console.log('To use the proxy:');
  console.log('1. Send API requests to http://localhost:3000/proxy/generate');
  console.log('2. Include your API key in the "x-api-key" header');
  console.log('3. Send a multipart/form-data request with a "prompt" field');
}); 