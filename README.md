# wG Discord Bot

## Requirements before using
### ***config.json:***
The settings file of the application

    {
        "token": "Discord Bot API Key",
        "prefix": "/",
        "GOOGLE_APPLICATION_CREDENTIALS": "googleCloud.json"
    }
### ***db.json:***
This json file is a file-based database that holds discord server information.

    {
      "servers": []
    }
### ***googleCloud.json:***
It is the service account api information required to use Google speech-to-text. You can obtain this on Google Cloud Platform.