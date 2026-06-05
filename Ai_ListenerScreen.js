import React, { useState } from "react";
import { View, TextInput, Button, Text, Platform } from "react-native";
import axios from "axios";

const FALLBACK_API_BASE_URL = Platform.select({
  android: "http://10.0.2.2:8000",
  default: "http://127.0.0.1:8000",
});
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || FALLBACK_API_BASE_URL;

export default function Chat() {

  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");

  const send = async () => {
    try {
      const res = await axios.post(
        `${API_BASE_URL}/ai`,
        null,
        {
          params: {
            message
          }
        }
      );

      setResponse(res.data.response);
    } catch (error) {
      setResponse("Unable to reach the listener service right now.");
    }
  };

  return (
    <View>

      <TextInput
        value={message}
        onChangeText={setMessage}
      />

      <Button
        title="Send"
        onPress={send}
      />

      <Text>{response}</Text>

    </View>
  );
}