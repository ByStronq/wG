# wG Discord Bot

## Requirements before using
### ***config.json:***
The settings file of the application

    {
        "token": "Discord Bot API Key",
        "prefix": "/",
        "GOOGLE_APPLICATION_CREDENTIALS": "googleCloud.json",
        "firebaseDbUrl": "https://*.firebasedatabase.app"
    }
### ***firebase.json:***
This json file is the real-time firebase database service account information that holds discord server information. Blank database instance:

    {
      "servers": []
    }
### ***googleCloud.json:***
It is the service account api information required to use Google speech-to-text. You can obtain this on Google Cloud Platform.