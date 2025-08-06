// run "npm run start -- --http-port 3000"
// and then this script in another terminal

import http from 'http';

let SERVER_PORT = 3000;
let TEST_QUESTION = 'What is the capital of France?';

for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--port' || process.argv[i] === '-p') {
    SERVER_PORT = parseInt(process.argv[i + 1], 10) || SERVER_PORT;
    i++; // Skip next argument as it's the port number
  } else {
    TEST_QUESTION = process.argv[i];
  }
}

const SERVER_URL = `http://localhost:${SERVER_PORT}`;

function makeRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      const postData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          resolve({ data: parsedData, status: res.statusCode });
        } catch (error) {
          resolve({ data: responseData, status: res.statusCode });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function testHttpServer() {
  try {
    console.log('Testing HTTP server...');
    
    // Step 1: Post question
    console.log(`\nPosting question: "${TEST_QUESTION}"`);
    const postResponse = await makeRequest(`${SERVER_URL}/question`, 'POST', {
      text: TEST_QUESTION
    });
    
    if (postResponse.status !== 200) {
      console.error('Failed to post question:', postResponse.data);
      return;
    }
    
    const questionId = postResponse.data.questionId;
    console.log(`Received questionId: ${questionId}`);
    
    // Step 2: Poll for answer 10 times, every second
    console.log('\nPolling for answer every second (10 attempts)...\n');
    
    for (let i = 1; i <= 100; i++) {
      try {
        const response = await makeRequest(`${SERVER_URL}/answer/${questionId}`);
        
        if (response.status === 200) {
          console.log(`Poll ${i}:`, JSON.stringify(response.data, null, 2));
          
          // If we got a complete response, we can stop polling
          if (response.data.status === 'finished') {
            console.log('\nAnswer received! Stopping polling.');
            break;
          }
        } else if (response.status === 404) {
          console.log(`Poll ${i}: Question not found (404)`);
        } else {
          console.log(`Poll ${i}: HTTP ${response.status} -`, response.data);
        }
      } catch (error) {
        console.log(`Poll ${i}: Error -`, error.message);
      }
      
      // Wait 3 seconds before next poll (except on last iteration)
      if (i < 100) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    console.log('\nPolling completed.');
    
  } catch (error) {
    console.error('Test failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error(`Make sure the HTTP server is running on localhost:${SERVER_PORT}`);
    }
  }
}

testHttpServer();
