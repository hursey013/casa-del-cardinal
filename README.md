# casadelcardinal

> Friendly bot logging visitors to our window mounted bird feeder in Charlottesville, VA

## Introduction

`casadelcardinal` is a Firebase Cloud Function and Tensorflow.js object detection model which provide an API endpoint to identify the species of a bird in given q image. The results are stored in a Firebase Realtime Database and passed to the Twitter API to update the connected account's status.

## Requirements

- [Home Assistant](https://github.com/home-assistant/core)
- [Frigate](https://github.com/blakeblackshear/frigate)
- [eclipse-mosquitto](https://hub.docker.com/_/eclipse-mosquitto) or another MQTT broker

## Initial setup

### Clone this repo

- Clone or download this repo and open the `casadelcardinal` directory.

### Create a Firebase project

- Create a Firebase Project using the [Firebase Developer Console](https://console.firebase.google.com)
- Enable billing on your project by switching to the Blaze or Flame plan. See [pricing](https://firebase.google.com/pricing/) for more details. This is required to allow requests to non-Google services within the Function.
- Install [Firebase CLI Tools](https://github.com/firebase/firebase-tools) if you have not already, and log in with `firebase login`.
- Configure the function to use your project using `firebase use --add` and select your project.

### Install dependencies and add environment variables

- Install dependencies locally by running: `cd functions; npm i; cd -`
- [Add your Twitter API credentials](https://developer.twitter.com/) to the Firebase config:
  ```bash
  firebase functions:config:set \
  twitter.consumer_key=<YOUR TWITTER CONSUMER KEY> \
  twitter.consumer_secret=<YOUR TWITTER CONSUMER SECRET> \
  twitter.access_token=<YOUR TWITTER ACCESS TOKEN> \
  twitter.access_token_secret=<YOUR TWITTER ACCESS TOKEN SECRET> \
  ```

### Customize function

There are a number of variables which can be customized within the function. Begin by copying config.sample.js to config.js.

- `apiUrl` - set to your public Home Assistant URL
- `cooldown` - number of minutes to wait before reposting the same species
- `known` - IDs of species includes in array will always be considered valid
- `threshold` - if not included in `known`, the score must be above this threshold to be valid

`casadelcardinal` uses [RosaeNLG](https://rosaenlg.org/), a Natural Language Generation library, to generate the text for the Twitter status updates. For more information about the syntax used, visit [RosaeNLG](https://rosaenlg.org/).

Within the template, the following values can be used:

- `known` - boolean, is the species included in the `known` array
- `now` - number, the current hour (from 0 to 23)
- `results` - object, includes the following keys: `id`, `name`, `common_name`, `score`
- `threshold` - number, value set in config.js

### Deploy the app to production

- Deploy your function using `firebase deploy --only functions`

After deploying the function POST requests can be sent to:

```
https://<your-project-id>.firebaseapp.com/app
```

### Configure Frigate

The steps to configure Frigate will vary based on your setup. Review the [Frigate docs](https://blakeblackshear.github.io/frigate/) for more information. The following settings should be included to support `casadelcardinal`:

```
...
mqtt:
  host: xxx.xxx.xxx.xxx
clips:
  max_seconds: 0
cameras:
  feeder:
    ffmpeg:
      inputs:
        - path: rtsp://user:pass@xxx.xxx.xxx.xxx/live
          roles:
            - clips
            - detect
    best_image_timeout: 300
    snapshots:
      crop: True
      enabled: True
    clips:
      enabled: True
      pre_capture: 0
      post_capture: 0
    detect:
      max_disappeared: 50
    objects:
      track:
        - bird
      filters:
        bird:
          min_area: 90000
...
```

### Create Home Assistant automation

The steps to configure your Home Assistant automation will vary based on your preferences. The following example uses MQTT and a [RESTful Command](https://www.home-assistant.io/integrations/rest_command/) to trigger the Firebase Function at the end of a Frigate event:

#### automations.yaml

```
  trigger:
  - platform: mqtt
    topic: frigate/events
  condition:
  - condition: template
    value_template: '{{ trigger.payload_json["type"] == "end" }}'
  action:
  - service: rest_command.casa_del_cardinal
    data_template:
      payload: '{{trigger.payload}}'
```

#### configuration.yaml

```
rest_command:
  casa_del_cardinal:
    url: "https://<your-project-id>.firebaseapp.com/app"
    method: POST
    payload: '{{ payload }}'
    content_type: "application/json; charset=utf-8"
    timeout: 300
```
