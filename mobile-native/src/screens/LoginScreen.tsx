import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { APP_NAME } from "../config";
import { useAuth } from "../context/AuthContext";
import { pressedStyle, pressFeedback, tapFeedback } from "../theme/platform";

export default function LoginScreen() {
  const { signIn, emailHint } = useAuth();
  const [email, setEmail] = useState(emailHint);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setError("");
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Enter email and password.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await signIn(trimmedEmail, password);
      if (!result.ok) setError(result.error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.brand}>{APP_NAME}</Text>
        <Text style={styles.subtitle}>Sign in to your fleet account</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          // Lets iCloud Keychain / Google Password Manager offer saved fleet logins.
          textContentType="username"
          autoComplete="email"
          returnKeyType="next"
          placeholder="you@company.com"
          placeholderTextColor="#64748b"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          editable={!submitting}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          secureTextEntry
          textContentType="password"
          autoComplete="password"
          returnKeyType="go"
          placeholder="Password"
          placeholderTextColor="#64748b"
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          editable={!submitting}
          onSubmitEditing={() => void onSubmit()}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          {...pressFeedback}
          style={({ pressed }) => [styles.button, submitting && styles.buttonDisabled, pressedStyle(pressed)]}
          onPress={() => {
            tapFeedback();
            void onSubmit();
          }}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#0f172a" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0b1220",
    justifyContent: "center",
    padding: 24
  },
  card: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#1f2937"
  },
  brand: {
    color: "#f8fafc",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4
  },
  subtitle: {
    color: "#94a3b8",
    marginBottom: 24
  },
  label: {
    color: "#cbd5e1",
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "600"
  },
  input: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    color: "#f8fafc",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16
  },
  error: {
    color: "#f87171",
    marginBottom: 12
  },
  button: {
    backgroundColor: "#38bdf8",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    overflow: "hidden",
    marginTop: 4
  },
  buttonDisabled: {
    opacity: 0.7
  },
  buttonText: {
    color: "#0f172a",
    fontWeight: "700",
    fontSize: 16
  }
});
