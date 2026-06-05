speaker_queue = []
listener_queue = []

def add_speaker(user_id):
    speaker_queue.append(user_id)

def add_listener(user_id):
    listener_queue.append(user_id)

def match_users():
    if speaker_queue and listener_queue:
        speaker = speaker_queue.pop(0)
        listener = listener_queue.pop(0)

        return {
            "speaker": speaker,
            "listener": listener
        }

    return None