speaker_queue = []
listener_queue = []
matched_peers = {}


def _remove_from_queue(queue, user_id):
    try:
        queue.remove(user_id)
        return True
    except ValueError:
        return False


def _set_match(speaker_id, listener_id):
    matched_peers[speaker_id] = listener_id
    matched_peers[listener_id] = speaker_id


def _match_now_or_queue(user_id, own_queue, opposite_queue):
    # Keep users from existing in both queues when they switch roles.
    _remove_from_queue(opposite_queue, user_id)

    if user_id in matched_peers:
        return {"status": "matched", "peer_id": matched_peers[user_id]}

    _remove_from_queue(own_queue, user_id)

    if opposite_queue:
        peer_id = opposite_queue.pop(0)
        _set_match(user_id, peer_id)
        return {"status": "matched", "peer_id": peer_id}

    own_queue.append(user_id)
    return {"status": "waiting"}


def add_speaker(user_id):
    return _match_now_or_queue(user_id, speaker_queue, listener_queue)


def add_listener(user_id):
    return _match_now_or_queue(user_id, listener_queue, speaker_queue)


def get_match_for_user(user_id):
    peer_id = matched_peers.get(user_id)
    if peer_id:
        return {"status": "matched", "peer_id": peer_id}
    return {"status": "waiting"}


def leave(user_id):
    left_queue = _remove_from_queue(speaker_queue, user_id) or _remove_from_queue(listener_queue, user_id)
    peer_id = matched_peers.pop(user_id, None)
    if peer_id:
        matched_peers.pop(peer_id, None)
    return {
        "status": "left",
        "left_queue": left_queue,
        "had_match": bool(peer_id),
        "peer_id": peer_id,
    }


def match_users():
    # Backward compatibility for older callers that expect a global match endpoint.
    if speaker_queue and listener_queue:
        speaker_id = speaker_queue.pop(0)
        listener_id = listener_queue.pop(0)
        _set_match(speaker_id, listener_id)
        return {
            "speaker": speaker_id,
            "listener": listener_id,
        }

    return None