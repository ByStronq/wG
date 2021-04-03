const { db } = require("./firebase");
const youtube = require("discord-ytdl-core");
const youtubeSearch = require('ytsr');
const youtubePlaylist = require('ytpl');
const Discord = require("discord.js");
const config = require("./config.json");
const speech = require("@google-cloud/speech");

const wG = new Discord.Client({ partials: ['MESSAGE', 'CHANNEL', 'REACTION'] });
const lang = require("./lang.json");

const snooze = ms => new Promise(resolve => setTimeout(resolve, ms));

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
    if (msg.channel.type == "text" && msg.author && !msg.author.bot)
    {
        let channel = msg.member.voice.channel;
    
        if (msg.content.startsWith(config.prefix) && msg.member.hasPermission('ADMINISTRATOR')) {
    
            var message = msg.content.substring(1).toLowerCase();
    
            if (message == "setup") {
                createChannels(msg.guild);
            } else if (message == "createdynvc") {
                setDynVC(msg.guild.id, (await createDynVC(msg.guild)).id);
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
        } else if ((await DatabaseRW(msg.guild.id)).textChannelId == msg.channel.id) {
            sendMusic(msg.content, channel);
            msg.delete({ timeout: 2500 });
        }
    }

});

async function sendMusic(musicString, channel) {
    let isUserPlaylist = channel.members.get(musicString),
        urls = [];
    if (!isUserPlaylist) {
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
    }

    if (channel !== null) {
        let server = await DatabaseRW(channel.guild.id);
        server.playlist = isUserPlaylist ? server.userPlaylists.find(user => user.id == musicString).playlist : urls;

        await DatabaseRW(channel.guild.id, server);
        //let videoInfos = await youtube.getInfo(server.playlist[0]);
        //play(channel, videoInfos.videoDetails.thumbnails[4].url);
        play(channel, "https://img.youtube.com/vi/" + server.playlist[0] + "/maxresdefault.jpg");
    }
}

async function play(channel, thumbnailUrl) {
    let server = await DatabaseRW(channel.guild.id),
        stream = youtube(server.playlist[0], {
        filter: "audioonly",
        opusEncoded: true,
        encoderArgs: ['-af', 'bass=g=10,dynaudnorm=f=200']
    });
    
    channel.join().then(async connection => {
        let playerMessage = await wG.channels.cache.get(server.textChannelId).messages.fetch(server.playerMessageId),
            isQueuePrintFinished = false;
        //playerMessage.attachments.clear();
        playerMessage.edit(playerMessage.embeds[0].setImage(thumbnailUrl));

        let editQueue = async () => {
            let queue = playerMessage.content;
            if (queue == "")
            {
                for (let i = 0; i <= 8; i++) {
                    if (server.playlist[i]) {
                        let videoInfos = await youtube.getInfo(server.playlist[i]);
                        queue += i + 1 + ". " + videoInfos.videoDetails.title + "\n";
                        playerMessage.edit("```" + queue + "```");
                    } else break;
                }
                
                if (server.playlist.length > 9)
                {
                    queue +=  (server.playlist.length >= 11 ? ".\n.\n.\n" : "") + server.playlist.length + ". ";
                    let videoInfos = await youtube.getInfo(server.playlist[server.playlist.length - 1]);
                    queue += videoInfos.videoDetails.title;
                } playerMessage.edit("```" + queue + "```").then(() => isQueuePrintFinished = true);
            } else {
                let queueArr = queue.split('\n'), lastVideo = queueArr.pop().split('```')[0];
                queue = "";
                queueArr.shift();
                queueArr = queueArr.filter(x => x != ".");

                for (let i = 0; i <= 7; i++)
                {
                    if (queueArr[i]) {
                        queue += queueArr[i].replace(queueArr[i].charAt(0), i + 1) + "\n";
                    } else break;
                }

                    playerMessage.edit("```" + queue + "```");

                if (server.playlist[queueArr.length]) {
                    let videoInfos = await youtube.getInfo(server.playlist[queueArr.length]);
                    queue += queueArr.length + 1 + ". " + videoInfos.videoDetails.title + "\n";
                }

                if (server.playlist.length > 9) {
                    queue += (server.playlist.length >= 11 ? ".\n.\n.\n" : "") + server.playlist.length + lastVideo.slice(lastVideo.indexOf('.'));
                }

                    playerMessage.edit("```" + queue + "```").then(() => isQueuePrintFinished = true);
            }
        };
            
        editQueue();
        let playedVideoInfos = await youtube.getInfo(server.playlist[0]);
        let dispatcher = connection.play(stream, {
            type: "opus"
        })
        .on("speaking", async () => {
            let streamTime = dispatcher.streamTime;
            if (streamTime % 5000 == 0 && isQueuePrintFinished) {
                let currentSecond = streamTime / 1000,
                    queue = playerMessage.content,
                    queueArr = queue.split('\n');
                queue = "";
                if (!queueArr[queueArr.length - 1].includes("```")) {
                    queueArr.pop();
                }
                queueArr.forEach(video => queue += video + "\n");
                let totalSeconds = playedVideoInfos.videoDetails.lengthSeconds;
                for (let i = 1; i <= 30; i++)
                {
                    queue += i == Math.round(30 * currentSecond / totalSeconds) ? "⚪" : "─";
                }
                queue += " " + Math.floor(currentSecond / 60) + ":" + currentSecond % 60;
                queue += " / " + Math.floor(totalSeconds / 60) + ":" + totalSeconds % 60;
                playerMessage.edit(queue);
            }
        })
        .on("finish", async () => {
            playerMessage.edit(playerMessage.embeds[0].setImage(/*'attachment://bg.jpg'*/'https://i.hizliresim.com/CjbyP6.png'));
            playerMessage.edit("");
            if (playerMessage.reactions.cache.find(react => react.emoji.name == "🔁")) {
                server.playlist.push(server.playlist.shift());
            } else if (playerMessage.reactions.cache.find(react => react.emoji.name == "🔂")) {
                
            } else {
                server.playlist.shift();
            }
            await DatabaseRW(channel.guild.id, server);

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
                            playerMessage.edit(playerMessage.embeds[0].setImage(/*'attachment://bg.jpg'*/'https://i.hizliresim.com/CjbyP6.png'));
                            playerMessage.edit("");
                            server.playlist = [];
                            DatabaseRW(channel.guild.id, server);
                            dispatcher.destroy();
                        });
                /*05*/ eventEmitter.on('musicNextEvent_' + server.id, () => dispatcher.emit('finish'));
                /*06*/ eventEmitter.on('musicSetVolumeEvent_' + server.id, (vol) => dispatcher.setVolume(dispatcher.volume + vol));
                /*07*/ eventEmitter.on('musicShuffleEvent_' + server.id, () => {
                            shuffle(server.playlist);
                            DatabaseRW(channel.guild.id, server);
                        });
                /*08*/ eventEmitter.on('musicFavEvent_' + server.id, (userId, fav) => {
                            if (!server.userPlaylists)
                                server.userPlaylists = [];

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
                            DatabaseRW(channel.guild.id, server);
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

    let server = await DatabaseRW(react.message.guild.id);

    if (user.id !== wG.user.id && server.textChannelId == react.message.channel.id)
    {
        switch (react.emoji.name) {
            case "🇹🇷": case "🇬🇧": case "🇵🇱": case "🇩🇪": case "🇷🇺": case "🇨🇳":
                createChannels(react.message.guild, react.emoji.name);
                break;
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
                if (!server.playlist) {
                    let voiceChannel = wG.guilds.cache.get(react.message.guild.id)
                                         .members.cache.get(user.id)
                                         .voice.channel;
                    sendMusic(user.id, voiceChannel);
                } else {
                    eventEmitter.emit('musicFavEvent_' + react.message.guild.id, user.id, true);
                }
                break;
            case "❌":
                if (react.message.id === server.playerMessageId) {
                    eventEmitter.emit('musicFavEvent_' + react.message.guild.id, user.id, false);
                } else {
                    setDynVC(react.message.guild.id, react.message.guild.member(user.id).voice.channel.id, true);
                }
                break;
            case "➕":
                eventEmitter.emit('musicSetVolumeEvent_' + react.message.guild.id, 0.1);
                break;
            case "➖":
                eventEmitter.emit('musicSetVolumeEvent_' + react.message.guild.id, -0.1);
                break;
            case "⬇️":
                eventEmitter.emit('musicDownloadEvent_' + react.message.guild.id, user);
                break;
            case "⚡":
                setDynVC(react.message.guild.id, (await createDynVC(react.message.guild)).id);
                break;
            case "✔️":
                setDynVC(react.message.guild.id, react.message.guild.member(user.id).voice.channel.id);
                break;
        }
        
        react.users.remove(user.id);
    }

});

async function createChannels(guild, language = "🇬🇧") {

    let _channel, server = await DatabaseRW(guild.id);
    
    await guild.channels.create('🎶-wg-music', { type: 'text' }).then(channel => {

        channel.setTopic('⏯️ ' + lang.btnPauseDesc[language] + '\n\n' +
                         '⏹️ ' + lang.btnStopDesc[language] + '\n\n' +
                         '⏭️ ' + lang.btnSkipDesc[language] + '\n\n' +
                         '🔄 ' + lang.btnLoopDesc[language] + '\n\n' +
                         '🔀 ' + lang.btnShuffleDesc[language] + '\n\n' +
                         '⭐ ' + lang.btnFavDesc[language] + '\n\n' +
                         '❌ ' + lang.btnUnFavDesc[language] + '\n\n' +
                         '➕ ' + lang.btnVolIncDesc[language] + '\n\n' +
                         '➖ ' + lang.btnVolDecDesc[language] + '\n\n' +
                         '⬇️ ' + lang.btnDownDesc[language]);
                         
        channel.send(new Discord.MessageAttachment().setFile('./contents/uploads/logo.png')).then(message => {
            message.edit("***" + lang.selectLangDesc[language] + "***");
            message.react("🇹🇷"); message.react("🇬🇧"); message.react("🇵🇱"); message.react("🇩🇪"); message.react("🇷🇺"); message.react("🇨🇳");
            channel.send(new Discord.MessageEmbed()
            .addField(lang.dynVcMessage.fields[0].name[language], lang.dynVcMessage.fields[0].value[language])
            .addField(lang.dynVcMessage.fields[1].name[language], lang.dynVcMessage.fields[1].value[language])
            .addField(lang.dynVcMessage.fields[2].name[language], lang.dynVcMessage.fields[2].value[language])
            )
            .then(message => { message.react("⚡"); message.react("✔️"); message.react("❌"); });
            channel.send(new Discord.MessageEmbed()
            .setTitle(lang.playerMessage.title[language])
            .addField(lang.playerMessage.field.name[language], lang.playerMessage.field.value[language])
            .addField("\u200b", "[Github](https://github.com/ByStronq/wG) | [TechnoVadi](https://technovadi.com)")
            //.attachFiles(['./contents/uploads/bg.jpg'])
            .setImage(/*'attachment://bg.jpg'*/'https://i.hizliresim.com/CjbyP6.png')
            .setColor("#c9c0ff")
            .setFooter(lang.playerMessage.footer[language]))
            .then(message => { message.react("⏯️"); message.react("⏹️"); message.react("⏭️"); message.react("🔀"); message.react("⭐"); message.react("❌");
                               message.react("➕"); message.react("➖"); message.react("⬇️"); message.react("🔄");
                server.playerMessageId = message.id;
                DatabaseRW(guild.id, server);
            });
        });
        
        _channel = channel;
    }).then(() => {
        let wGAdmin = guild.roles.cache.find(role => role.name === 'wGAdmin');
        if (wGAdmin) wGAdmin.delete();
        guild.roles.create({ data:{name: 'wGAdmin', color: 'PURPLE'} });
    }).catch(console.error);
    
    if (server) {            
        try { wG.channels.cache.get(server.textChannelId).delete(); } catch {}
        server.textChannelId = _channel.id;
    } else {
        server = {
            textChannelId: _channel.id,
            playerMessageId: "",
        };
    }

    DatabaseRW(guild.id, server);

}

async function DatabaseRW(id = null, data = null) {
    if (id != null) {
        let dbRef = db.ref('servers/' + id);
        if (data != null) {            
            dbRef.set(data);
            console.log(`Database updated with ${JSON.stringify(data)}`);
        } else {
            return (await dbRef.get()).val();
        }
    }
}

/***** DYNAMIC VOICE CHANNEL *****/

wG.on('voiceStateUpdate', async (oldMember, newMember) => {
    let newUserChannel = newMember.channelID,
        oldUserChannel = oldMember.channelID,
        newUserTempChannel = newUserChannel && newMember.channel.parent && lang.tempVC.cats.find(cat => cat == newMember.channel.parent.name),
        oldUserTempChannel = oldUserChannel && oldMember.channel.parent && lang.tempVC.cats.find(cat => cat == oldMember.channel.parent.name);
        
    if (newUserTempChannel || oldUserTempChannel) {
        if (newUserTempChannel) {
            if (lang.tempVC.vcs.find(vc => vc == newMember.channel.name)) {
                let game = newMember.member.presence.activities.find(x => x.type === "PLAYING");
                let tempVC = await newMember.channel.clone({ name: game ? `║🎮 ${game.name}` : `║👤 ${newMember.member.displayName}` });
                newMember.setChannel(tempVC);
            }
        }
        
        if (oldUserTempChannel) {
            if (!lang.tempVC.vcs.find(vc => vc == oldMember.channel.name) && oldMember.channel.members.size == 0) {
                oldMember.channel.delete();
            }
        }

        return;
    }
        let server = await DatabaseRW(newMember.guild.id);
    
            if (!server.dynamicVoiceChannels)
                server.dynamicVoiceChannels = [];
            
        let oldDynamicVoiceChannel =  server.dynamicVoiceChannels.find(x => x === oldUserChannel);
        let newDynamicVoiceChannel =  server.dynamicVoiceChannels.find(x => x === newUserChannel);
    
        if(newUserChannel && newDynamicVoiceChannel) {
            SetDynVCName(newMember);
        }
        
        if(oldDynamicVoiceChannel) {
            if (oldMember.channel.members.size == 0) {
                setDynVC(oldMember.guild.id, oldUserChannel, true);
                let dynCat = wG.guilds.cache.get(oldMember.guild.id).channels.cache.get(oldUserChannel).parent;
                await oldMember.channel.delete();
                if (dynCat.children.size == 0) {
                    dynCat.delete();
                }
            } else {
                SetDynVCName(oldMember);
            }
        }
});

async function SetDynVCName(member) {
    const voiceChId = member.channel.id;
    let gamePlayed = GetAllUsersGames(member.guild.id, voiceChId)[0];
    if (gamePlayed) {
        let game = gamePlayed.name,
            channelName = member.channel.name;
        if (channelName !== game)
        {
            await Promise.race([member.channel.setName(game).catch(console.error), snooze(5000)]);
            if (member.channel.name == game) {
                console.log(channelName + " " + game + " olarak değiştirildi");
            } else {
                let createdDynVC = await createDynVC(member.guild, game);
                await setDynVC(member.guild.id, voiceChId, true);
                let memberCount = member.channel.members.size;
                member.channel.members.forEach(async member => {
                    let movedMember = await member.voice.setChannel(createdDynVC);
                    if (movedMember.voice.channel.members.size == memberCount) {
                        await setDynVC(member.guild.id, createdDynVC.id);
                        wG.channels.cache.get(voiceChId).delete();
                    }
                });
            }
        }
    } else console.log("No one playing game!");
}

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

    return resultArr.sort((a,b) => b.counter - a.counter);
}

async function createDynVC(guild, game)
{
    let dynCat = guild.channels.cache.find(dynCat => dynCat.name == 'Dinamik Ses Kanalları' && dynCat.type == 'category');
    if (!dynCat) {
        dynCat = await guild.channels.create('Dinamik Ses Kanalları', { type: 'category' });
    }
    if (!game) {
        game = `#${dynCat.children.size + 1}`;
    }
    let createdDynVC = await guild.channels.create(game, { type: 'voice', parent: dynCat });
    return createdDynVC;
}

async function setDynVC(guildId, voiceChId, del = false)
{
    if (voiceChId !== null) {
        let server = await DatabaseRW(guildId);

            if (!server.dynamicVoiceChannels)
                server.dynamicVoiceChannels = [];

        let dynVoiceChs = server.dynamicVoiceChannels;
    
        if (del) {
            server.dynamicVoiceChannels = dynVoiceChs.filter(x => x !== voiceChId);
            return DatabaseRW(guildId, server);
        } else if (!dynVoiceChs.find(x => x === voiceChId)) {
            dynVoiceChs.push(voiceChId);
            return DatabaseRW(guildId, server);
        }
    }
}

wG.login(config.token);