const youtube = require("discord-ytdl-core");
const youtubeSearch = require('ytsr');
const youtubePlaylist = require('ytpl');
const Discord = require("discord.js");
const config = require("./config.json");
const speech = require("@google-cloud/speech");

const wG = new Discord.Client();

const fs = require("fs");

const EventEmitter = require('events');
const eventEmitter = new EventEmitter();

wG.on('ready', () => {

    console.log('%s \x1b[31m%s\x1b[0m\x1b[32m%s\x1b[0m!', 'Logged in as', `${wG.user.username}`, `${wG.user.tag.substring(wG.user.tag.length - 5)}`);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = config.GOOGLE_APPLICATION_CREDENTIALS;

});

let wordCounter = 0, charCounter = 0;
wG.on('guildMemberSpeaking', async (member, speaking) => {
    if (!member.user.bot && member.roles.cache.find(role => role.name == "wGAdmin")) {
        if (speaking) {
            member.voice.channel.join().then(async connection => {
                const audio = connection.receiver.createStream(member.id, { mode: 'pcm' });
                const chunks = [];
                audio.on('data', chunk => chunks.push(chunk));
                audio.on('end', async () => {
                    const speechClient = new speech.SpeechClient();
                    const [speechResponse] = await speechClient.recognize({
                        audio: {
                            content: Buffer.concat(chunks).toString('base64'),
                        },
                        config: {
                            encoding: 'LINEAR16',
                            sampleRateHertz: 48000,
                            audioChannelCount: 2,
                            languageCode: 'tr-TR',
                        },
                    });
                    const transcription = speechResponse.results.map(result =>
                        result.alternatives[0].transcript
                    ).join('\n');
                    //console.log(transcription);
                    if (transcription != "") {
                        let transcript = transcription.toLowerCase().split(" ");
                        wordCounter += transcript.length;
                        let musicString = "";
                        for (let i = 0; i <= transcript.length - 1; i++) {
                            charCounter += transcript[i].length;
                            if (transcript[0] + " " + transcript[1] == "müzik botu") {
                                if (transcript[transcript.length - 1] == "çal") {
                                    if (i >= 2 && i < transcript.length - 1) {
                                        musicString += transcript[i] + " ";
                                        if (i == transcript.length - 2) {
                                            sendMusic(musicString, member.voice.channel);
                                        }
                                    }
                                } else if (transcript[transcript.length - 1] == "duraklat") {
                                    eventEmitter.emit('musicPauseEvent_' + react.message.guild.id);
                                } else if (transcript[transcript.length - 2] == "devam" && transcript[transcript.length - 1] == "et") {
                                    eventEmitter.emit('musicResumeEvent_' + react.message.guild.id);
                                }
                            }
                        }
                    }
                });
            });
        } else {
            console.log('not speaking!');
        }
    } else {
        //console.log('bot speaking!');
    }
});

wG.on('guildCreate', guild => createChannels(guild));
wG.on('message', async msg => {
    if (msg.channel.type != "dm" && !msg.member.user.bot)
    {
        let channel = msg.member.voice.channel;
    
        if (msg.content.startsWith(config.prefix) && msg.member.hasPermission('ADMINISTRATOR')) {
    
            var message = msg.content.substring(1).toLowerCase();
    
            if (message == "setup") {
                createChannels(msg.guild);
            } else if (message == "createdynvc") {
                let createdDynVCId = await msg.guild.channels.create('Oyun Odası', { type: 'voice' });
                setDynVC(msg.guild.id, createdDynVCId.id);
            } else if (message == "setdynvc") {
                setDynVC(msg.guild.id, msg.member.voice.channelID);
            } else if (message == "deldynvc") {
                setDynVC(msg.guild.id, msg.member.voice.channelID, true);
            } else if (message == "join") {
                channel.join();
            } else if (message == "wordcounter") {
                msg.reply(`Şu ana kadar ${Math.ceil(wordCounter / 2)} kelime konuşuldu :)`).then(msg => msg.delete({ timeout: 2500 }));
                msg.reply(`Bunların hepsi toplamda ${Math.ceil(charCounter / 2)} karakterden oluşuyor :)`).then(msg => msg.delete({ timeout: 2500 }));
            }
            
            msg.delete({ timeout: 2500 }).catch(err => {});
        } else if (DatabaseRW().servers.find(x => x.textChannelId === msg.channel.id)) {
            sendMusic(msg.content, channel);
            msg.delete({ timeout: 2500 });
        }
    }

});

async function sendMusic(musicString, channel) {
    let urls = [];
    if (youtube.validateURL(musicString)) {
        let url = musicString;
        if (youtubePlaylist.validateID(url)) {
            const playlist = await youtubePlaylist(url, { pages: 1 });
            playlist.items.map(video => {
                urls.push(video.id);
            });
        } else {
            urls.push(youtube.getVideoID(url));
        }
    } else {
        const search = await youtubeSearch(musicString, { pages: 1 });
             if (search.items.length > 0)
                 urls.push(search.items[0].id);
    }

    if (channel !== null) {
        let server = DatabaseRW().servers.filter(x => x.id === channel.guild.id)[0];
        server.playlist = urls;

        DatabaseRW(true, server);
        //let videoInfos = await youtube.getInfo(server.playlist[0]);
        //play(channel, videoInfos.videoDetails.thumbnails[4].url);
        play(channel, "https://img.youtube.com/vi/" + server.playlist[0] + "/maxresdefault.jpg");
    }
}

function play(channel, thumbnailUrl) {
    let server = DatabaseRW().servers.filter(x => x.id === channel.guild.id)[0],
        stream = youtube(server.playlist[0], {
        filter: "audioonly",
        opusEncoded: true,
        encoderArgs: ['-af', 'bass=g=10,dynaudnorm=f=200']
    });
    
    channel.join().then(async connection => {
        let playerMessage = await wG.channels.cache.get(server.textChannelId).messages.fetch(server.playerMessageId);
        //playerMessage.attachments.clear();
        playerMessage.edit(playerMessage.embeds[0].setImage(thumbnailUrl));
        let queue = "Kuyruktakiler:\n";

            for (let i = 0; i <= server.playlist.length - 1; i++) {
                let videoInfos = await youtube.getInfo(server.playlist[i]);
                queue += i + 1 + "." + videoInfos.videoDetails.title + "\n";
            }
            
        playerMessage.edit(queue);
        let dispatcher = connection.play(stream, {
            type: "opus"
        })
        .on("finish", () => {
            playerMessage.edit(playerMessage.embeds[0].setImage(/*'attachment://bg.jpg'*/'https://i.pinimg.com/originals/e6/0e/53/e60e531bb26f15c5f69c2cb35633bf46.jpg'));
            playerMessage.edit("");
            if (playerMessage.reactions.cache.find(react => react.emoji.name == "🔁")) {
                server.playlist.push(server.playlist.shift());
            } else if (playerMessage.reactions.cache.find(react => react.emoji.name == "🔂")) {
                
            } else {
                server.playlist.shift();
            }
            DatabaseRW(true, server);

            if (server.playlist[0]) {
                play(channel, "https://img.youtube.com/vi/" + server.playlist[0] + "/maxresdefault.jpg");
            } else {
                //channel.leave();
            }
        });
            /***** REMOVE ALL LISTENERS *****/
                /*01*/ eventEmitter.removeAllListeners('musicPauseEvent_' + server.id);
                /*02*/ eventEmitter.removeAllListeners('musicResumeEvent_' + server.id);
                /*03*/ eventEmitter.removeAllListeners('musicPauseResumeEvent_' + server.id);
                /*04*/ eventEmitter.removeAllListeners('musicStopEvent_' + server.id);
                /*05*/ eventEmitter.removeAllListeners('musicNextEvent_' + server.id);
                /*06*/ eventEmitter.removeAllListeners('musicSetVolumeEvent_' + server.id);
                /*07*/ eventEmitter.removeAllListeners('musicShuffleEvent_' + server.id);
                /*08*/ eventEmitter.removeAllListeners('musicFavEvent_' + server.id);
                /*09*/ eventEmitter.removeAllListeners('musicLoopModeEvent_' + server.id);
                /*10*/ eventEmitter.removeAllListeners('musicDownloadEvent_' + server.id);
            /***** REMOVE ALL LISTENERS *****/
            
            /***** ADD LISTENER *****/
                /*01*/ eventEmitter.on('musicPauseEvent_' + server.id, () => dispatcher.pause());
                /*02*/ eventEmitter.on('musicResumeEvent_' + server.id, () => dispatcher.resume());
                /*03*/ eventEmitter.on('musicPauseResumeEvent_' + server.id, () => dispatcher.paused ? dispatcher.resume() : dispatcher.pause());
                /*04*/ eventEmitter.on('musicStopEvent_' + server.id, () => {
                            playerMessage.edit(playerMessage.embeds[0].setImage(/*'attachment://bg.jpg'*/'https://i.pinimg.com/originals/e6/0e/53/e60e531bb26f15c5f69c2cb35633bf46.jpg'));
                            playerMessage.edit("");
                            server.playlist = [];
                            DatabaseRW(true, server);
                            dispatcher.destroy();
                        });
                /*05*/ eventEmitter.on('musicNextEvent_' + server.id, () => dispatcher.emit('finish'));
                /*06*/ eventEmitter.on('musicSetVolumeEvent_' + server.id, (vol) => dispatcher.setVolume(dispatcher.volume + vol));
                /*07*/ eventEmitter.on('musicShuffleEvent_' + server.id, () => {
                            shuffle(server.playlist);
                            DatabaseRW(true, server);
                        });
                /*08*/ eventEmitter.on('musicFavEvent_' + server.id, (userId, fav) => {
                            let user = server.userPlaylists.filter(user => user.id == userId)[0];
                            if (user) {
                                if (!user.playlist.find(x => x == server.playlist[0])) {
                                    if (fav) {
                                        user.playlist.push(server.playlist[0]);
                                    }
                                } else if (!fav) {
                                    user.playlist = user.playlist.filter(x => x != server.playlist[0]);
                                }
                                    server.userPlaylists = server.userPlaylists.filter(user => user.id != userId);
                                    if (user.playlist.length > 0) {
                                        server.userPlaylists.push(user);
                                    }
                            } else if (fav) {
                                server.userPlaylists.push({
                                    id: userId,
                                    playlist: [server.playlist[0]],
                                });
                            }
                            DatabaseRW(true, server);
                        });
                /*09*/ eventEmitter.on('musicLoopModeEvent_' + server.id, (react) => {
                            let currentLoopMode = react.emoji.name, changedLoopMode = "🔄";
                            if (currentLoopMode == "🔄") {
                                changedLoopMode = "🔁";
                            } else if (currentLoopMode == "🔁") {
                                changedLoopMode = "🔂";
                            }
                            react.remove();
                            playerMessage.react(changedLoopMode);
                        });
                /*10*/ eventEmitter.on('musicDownloadEvent_' + server.id, async (user) => {
                    let videoInfos = await youtube.getInfo(server.playlist[0]);
                    user.send(new Discord.MessageAttachment().setFile(youtube.downloadFromInfo(videoInfos, { filter: "audioonly", }), videoInfos.videoDetails.title + '.mp3'));
                });
            /***** ADD LISTENER *****/
    });
}

function shuffle(array) {
  var currentIndex = array.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

wG.on('messageReactionAdd', async (react, user) => {

    if (react.partial) { try { await react.fetch(); } catch (error) { console.error('Something went wrong when fetching the message: ', error); return; } }

    if (user.id !== wG.user.id && DatabaseRW().servers.find(x => x.textChannelId === react.message.channel.id))
    {
        switch (react.emoji.name) {
            case "⏯️":
                eventEmitter.emit('musicPauseResumeEvent_' + react.message.guild.id);
                break;
            case "⏹️":
                eventEmitter.emit('musicStopEvent_' + react.message.guild.id);
                break;
            case "⏭️":
                eventEmitter.emit('musicNextEvent_' + react.message.guild.id);
                break;
            case "🔄": case "🔁": case "🔂":
                eventEmitter.emit('musicLoopModeEvent_' + react.message.guild.id, react);
                break;
            case "🔀":
                eventEmitter.emit('musicShuffleEvent_' + react.message.guild.id);
                break;
            case "⭐":
                eventEmitter.emit('musicFavEvent_' + react.message.guild.id, user.id, true);
                break;
            case "❌":
                eventEmitter.emit('musicFavEvent_' + react.message.guild.id, user.id, false);
                break;
            case "➕":
                eventEmitter.emit('musicSetVolumeEvent_' + react.message.guild.id, 0.1);
                break;
            case "➖":
                eventEmitter.emit('musicSetVolumeEvent_' + react.message.guild.id, -0.1);
                break;
            case "⬇️":
                eventEmitter.emit('musicDownloadEvent_' + react.message.guild.id, user);
        }
        
        react.users.remove(user.id);
    }

});

async function createChannels(guild) {

    let _channel, server = DatabaseRW().servers.filter(x => x.id === guild.id)[0];
    
    await guild.channels.create('🎶-wg-music', { type: 'text' }).then(channel => {

        channel.setTopic('⏯️ Şarkıyı durdur ve devam ettir.\n\n' +
                         '⏹️ Kuyruğu durdur ve boşalt.\n\n' +
                         '⏭️ Şarkıyı atla.\n\n' +
                         '🔄 Döngü modları arasında geçiş yap.\n\n' +
                         '🔀 Kuyruğu karıştır.\n\n' +
                         '⭐ Sana özel oynatma listesine şarkıyı ekle.\n\n' +
                         '❌ Sana özel oynatma listesinden şarkıyı kaldır.\n\n' +
                         '➕ Botun sesini herkes için %10 artır.\n\n' +
                         '➖ Botun sesini herkes için %10 azalt.\n\n' +
                         '⬇️ Çalan müziği indir.');
                         
        channel.send(new Discord.MessageAttachment().setFile('./contents/uploads/logo.png')).then(() => {
            channel.send(new Discord.MessageEmbed()
            .setTitle("wG Müzik Botu")
            .addField("Butonlarla kontrol edebilirsiniz.", "Komut yazmanıza gerek yok ve ön ek yok!")
            //.attachFiles(['./contents/uploads/bg.jpg'])
            .setImage(/*'attachment://bg.jpg'*/'https://i.pinimg.com/originals/e6/0e/53/e60e531bb26f15c5f69c2cb35633bf46.jpg')
            .setColor("#c9c0ff")
            .setFooter("Ön ek yok! Direkt linki yapıştır veya arama yap :) => İmza: ByStrong"))
            .then(message => { message.react("⏯️"); message.react("⏹️"); message.react("⏭️"); message.react("🔀"); message.react("⭐"); message.react("❌");
                               message.react("➕"); message.react("➖"); message.react("⬇️"); message.react("🔄");
                server.playerMessageId = message.id;
                DatabaseRW(true, server);
            });
        });
        
        _channel = channel;
    }).then(() => {
        guild.roles.cache.find(role => role.name === 'wGAdmin').delete();
        guild.roles.create({ data:{name: 'wGAdmin', color: 'PURPLE'} });
    }).catch(console.error);
    
    if (server) {            
        try { wG.channels.cache.get(server.textChannelId).delete(); } catch {}
        server.textChannelId = _channel.id;
    } else {
        server = {
            id: guild.id,
            textChannelId: _channel.id,
            playerMessageId: "",
            playlist: [],
            userPlaylists: [],
            dynamicVoiceChannels: []
        };
    }

    DatabaseRW(true, server);

}

function DatabaseRW(isWrite = false, json = null) {
    let data = fs.readFileSync('db.json', 'utf8'),
        db = JSON.parse(data);

    if (json !== null) {
        if (isWrite) {
            if (db.servers.find(x => x.id === json.id)) {
                let index = db.servers.findIndex(x => x.id === json.id);
                db.servers[index] = json;
            } else {
                db.servers.push(json);
            }
            
            let dbJSON = JSON.stringify(db, null, 2);
            fs.writeFileSync('db.json', dbJSON, 'utf8');
            console.log(`Database updated with ${JSON.stringify(json)}`);
        } else {
            
        }
    } else {
        return db;
    }
}

/***** DYNAMIC VOICE CHANNEL *****/

wG.on('voiceStateUpdate', (oldMember, newMember) => {
    let newUserChannel = newMember.channelID,
        oldUserChannel = oldMember.channelID,
        dynamicVoiceChannel = DatabaseRW().servers.filter(x => x.id === newMember.guild.id)[0]
                                .dynamicVoiceChannels.filter(x => x === newUserChannel)[0];

    if (dynamicVoiceChannel)
    {
        const channel = wG.channels.cache.get(dynamicVoiceChannel);
        
        if(newUserChannel === null){
            
            console.log("Exited the room");
            channel.setName("Oyun Odası");
      
        } else {
            try
            {
                let gamesPlayed = GetAllUsersGames(newMember.guild.id, channel.id);
                let game = gamesPlayed[0].name;
                channel.setName(game).catch(console.error);
                console.log(channel.name + " " + game + " olarak değiştirildi");
            }
            catch
            {
                console.log("No one playing a game!");
            }
        }
    }
});

function GetAllUsersGames(guildId, filterVC = null){

    let server = wG.guilds.cache.get(guildId),
        onlineMembers = server.members.cache.filter(x => x.user.presence.status !== "offline"),
        gameList = [];

    if (filterVC !== null)
    {
        onlineMembers = onlineMembers.filter(x => x.voice.channelID === filterVC);
    }

    onlineMembers.forEach(member => {

        let gameActivity = member.user.presence.activities.filter(x => x.type === "PLAYING")[0];
        
        if (gameActivity) {
            gameList.push(gameActivity.name);
        }

    });

    return ArrayDuplicateCounter(gameList);
}

function ArrayDuplicateCounter(arr)
{
    let resultArr = [], previousValue;
    newArr = arr.sort();
    newArr.forEach(arrItem => {

        if (arrItem !== previousValue)
        {
            resultArr.push({
                name: arrItem,
                counter: 1,
            });
        }
        else
        {
            resultArr[resultArr.length - 1].counter++;
        }
        previousValue = arrItem;
    });

    return resultArr;
}

function setDynVC(guildId, voiceChId, del = false)
{
    if (voiceChId !== null) {
        let server = DatabaseRW().servers.filter(x => x.id === guildId)[0],
            dynVoiceChs = server.dynamicVoiceChannels;
    
        if (del) {
            server.dynamicVoiceChannels = dynVoiceChs.filter(x => x !== voiceChId);
            DatabaseRW(true, server);
        } else if (!dynVoiceChs.find(x => x === voiceChId)) {
            dynVoiceChs.push(voiceChId);
            DatabaseRW(true, server);
        }
    }
}

wG.login(config.token);