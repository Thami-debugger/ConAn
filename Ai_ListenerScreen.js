import React, { useState } from "react";
import { View, TextInput, Button, Text } from "react-native";
import axios from "axios";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://your-vercel-app.vercel.app";

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