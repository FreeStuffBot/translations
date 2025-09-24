# FreeStuff translations

Welcome!

This repo is the right place if you're interested in translating FreeStuff <3


## How (if you don't know git)

Click on the "discord-bot" folder above.

Then click on the language you'd like to translate.

Then find the little pencil icon in the top right that says "Edit this file".

You now see the translations.

The file looks as follows

```jsonc
  // This is the english original text here, this is what you translate
  "this_is_the_translation_key_keep_me_as_i_am": "This is your translation. You put your text here. Make sure you format everything properly, ask chatgpt for a JSON explanation if you need help!",
```

You can simply go through the file and edit translations. Do not edit the english original or the translation_keys.

Lines that have a `"translation_key": "",` are not yet translated. Those make a good starting point.

Once you're done you click on the green button **"Commit changes"** in the top right corner.

In the popup you click on the green button **"Propose changes"**.

You should now see a text field where it says `### Please select all that apply`. Ignore this for now and click the green button "Create pull request" one more time.

You can now check all the checkboxes that apply.

You MUST check the checkbox for accepting the CLA or else we cannot include your translations.

That's all, now wait :)


## How (if you do know git)

Read through the "How if you don't know git" above but use your usual git workflow idk :+1:


## Guidelines

Things to note:
- Some lines have `{text}` like this in curly brackets. Those are placeholders or templates and will be replaced with something else by the bot. DO NOT translate those. If a line has `{channel}` for example, the bot will replace it with `#your-channel` then. Keep it as `{channel}` and not as `{канал}`. Thank you! [^1]
- Some lines have `[text like this]({owo})` - those are links. Keep brackets as they are. The text in `[those brackets]` is the text the user sees. The text in `(those brackets)` is the link where it goes. You will probably only ever see a template here so don't be scared by the many brackets. Just keep them as is and only translate the text in `[those brackets]`.
- Some lines have `\n` - those are new lines. Enter key type stuff. We know this isn't perfect but it is what it is.
- Some lines have `\"` - those are normal `"` quotes. You need to prefix them with a backslash or else the thing will break lol. Json.

General guidelines:
- Stick to the original english text. You are allowed, even encouraged, to be creative in your translations however please ensure the following:
  * Keep the length roughly the same. If the english translation is two words, don't write five sentences.
  * Keep all the information. Most texts tell the user something. You can add a pun if you like but the information needs to be conveyed!
  * Keep the formatting as the english text does. This means do not randomly make things **bold** unless the english version has a certain word bold as well. And the other way around, if something is bold in english, make it bold in your translation too!
- The english "you" is insanely generic. Phrase all text from the bot in the informal singular translation of you. For German for instance this would be "du", not "Sie" or "Ihr".
- The messages about the bot should be in third person, e.g. "FreeStuff bot doesn't have permissions to do this". Some old translations still use "I" as in "I don't have permissions" - don't do this anymore. Use third person :+1:
- Be silly, be informal, remember the audience of this bot when working on your translations. But also remember the guidelines here.


## Note

We appreciate your interest and help a lot! Like seriously! But for legal reasons we're required to have you sign a Contributor License Agreement.
This sounds scary and has some scary words in it but essentially it's just there so you can't sue us for using the translations you provide.
You also don't actually need to physically sign it, you just need to digitally sign it by checking a checkbox when you make a pull request.


[^1]: FreeStuff supports full ICU formatting. You might encounter more complex and weird looking text inside `{ }`. In this case copy and paste the original into an online editor like https://format-message.github.io/icu-message-format-for-translators/editor.html to play around. If it works on this website it works with the bot! If you don't need pluralization you can also just use the plain `{variable}` syntax.
