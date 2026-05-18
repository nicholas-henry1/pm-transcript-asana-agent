// --- CONFIGURATION ---
const BUCKET_NAME = 'nick-transcripts-1778251680';

// PASTE THE ENTIRE CONTENT OF YOUR JSON KEY CONTENT BELOW
const JSON_KEY = {
  "type": "service_account",
  "project_id": "ascn-win-visit-3287-sbx",
  "private_key_id": "xx",
  "private_key": "-----BEGIN PRIVATE KEY----END PRIVATE KEY-----\n",
  "client_email": "pm-agent-identity@ascn-win-visit-3287-sbx.iam.gserviceaccount.com",
  "client_id": "111417065124640942317",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/pm-agent-identity%40ascn-win-visit-3287-sbx.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
}

/**
 * Main function: Scans your entire Drive for Gemini Notes/Transcripts
 * modified in the last 7 days and pushes them to GCP.
 */
function syncTranscripts() {
  // 1. Define the search (Any Doc containing these keywords modified in last 7 days)
const lookback = new Date(Date.now() - 1 * 60 * 60 * 1000);
  const searchString = "mimeType = 'application/vnd.google-apps.document' and " +
                       "modifiedDate > '" + lookback.toISOString().replace('Z', '') + "' and " + 
                       "(title contains 'Notes by Gemini' or title contains 'Transcript')";
  
  console.log("Searching for transcripts modified since: " + lookback.toLocaleString());
  
  const files = DriveApp.searchFiles(searchString);
  const token = getServiceToken();

  let count = 0;
  while (files.hasNext()) {
    const file = files.next();
    // Clean up the filename for GCP (remove special characters)
    const fileName = file.getName().replace(/[/\\?%*:|"<>]/g, '-') + ".txt";
    
    try {
      const doc = DocumentApp.openById(file.getId());
      const textContent = doc.getBody().getText();
      
      const success = uploadToGCS(textContent, fileName, token);
      if (success) {
        console.log("✅ Successfully synced: " + fileName);
        count++;
      }
    } catch (e) {
      console.log("❌ Error processing " + fileName + ": " + e.toString());
    }
  }
  
  console.log("Sync complete. Total files processed: " + count);
}

/**
 * Authenticates with GCP using the Service Account Key
 */
function getServiceToken() {
  const header = JSON.stringify({ "alg": "RS256", "typ": "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const claim = JSON.stringify({
    "iss": JSON_KEY.client_email,
    "scope": "https://www.googleapis.com/auth/devstorage.read_write",
    "aud": "https://oauth2.googleapis.com/token",
    "exp": now + 3600,
    "iat": now
  });

  const encode = (str) => Utilities.base64EncodeWebSafe(str).replace(/=+$/, '');
  const signatureInput = encode(header) + "." + encode(claim);
  const signature = Utilities.computeRsaSha256Signature(signatureInput, JSON_KEY.private_key);
  const jwt = signatureInput + "." + encode(signature);

  const params = {
    method: "post",
    payload: {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    }
  };
  
  const response = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", params);
  return JSON.parse(response.getContentText()).access_token;
}

/**
 * Uploads plain text content to Google Cloud Storage
 */
function uploadToGCS(content, fileName, token) {
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET_NAME}/o?uploadType=media&name=${encodeURIComponent(fileName)}`;
  const options = {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    contentType: "text/plain",
    payload: content,
    muteHttpExceptions: true
  };
  const response = UrlFetchApp.fetch(url, options);
  return response.getResponseCode() === 200;
}
