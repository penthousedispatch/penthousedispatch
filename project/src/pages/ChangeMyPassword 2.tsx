import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function ChangeMyPassword() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nonce, setNonce] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  const passwordValid =
    newPassword.length >= 12 &&
    newPassword.length <= 128 &&
    /[A-Z]/.test(newPassword) &&
    /[a-z]/.test(newPassword) &&
    /[0-9]/.test(newPassword) &&
    /[^A-Za-z0-9]/.test(newPassword);

  const passwordsMatch = newPassword === confirmPassword;

  async function sendVerificationCode() {
    setStatus("");
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setStatus("You must be logged in.");
        return;
      }

      const { error } = await supabase.auth.reauthenticate();

      if (error) {
        setStatus(error.message);
        return;
      }

      setCodeSent(true);
      setStatus("A verification code was sent to your email or phone.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword() {
    setStatus("");

    if (!passwordValid) {
      setStatus(
        "Password must be 12-128 characters and include uppercase, lowercase, number, and symbol."
      );
      return;
    }

    if (!passwordsMatch) {
      setStatus("Passwords do not match.");
      return;
    }

    if (!nonce.trim()) {
      setStatus("Enter the verification code first.");
      return;
    }

    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setStatus("You must be logged in to change your password.");
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        nonce: nonce.trim(),
      });

      if (error) {
        setStatus(error.message);
        return;
      }

      setStatus("Your password was updated successfully.");
      setNewPassword("");
      setConfirmPassword("");
      setNonce("");
      setCodeSent(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: 24 }}>
      <button
        onClick={() => navigate("/")}
        style={{
          marginBottom: 16,
          padding: "8px 14px",
          cursor: "pointer",
        }}
      >
        Exit
      </button>

      <h1>Change My Password</h1>

      <p style={{ marginTop: 8 }}>
        First send yourself a verification code, then enter a new password.
      </p>

      <div style={{ marginTop: 20 }}>
        <button
          onClick={sendVerificationCode}
          disabled={loading}
          style={{ padding: "10px 16px", marginBottom: 16 }}
        >
          {loading && !codeSent ? "Sending..." : "Send Verification Code"}
        </button>

        <label htmlFor="nonce">Verification Code</label>
        <input
          id="nonce"
          type="text"
          value={nonce}
          onChange={(e) => setNonce(e.target.value)}
          placeholder="Enter the code you received"
          style={{
            display: "block",
            width: "100%",
            marginTop: 8,
            marginBottom: 16,
            padding: 10,
          }}
        />

        <label htmlFor="new-password">New Password</label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Enter your new password"
          style={{
            display: "block",
            width: "100%",
            marginTop: 8,
            marginBottom: 16,
            padding: 10,
          }}
        />

        <label htmlFor="confirm-password">Confirm New Password</label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter your new password"
          style={{
            display: "block",
            width: "100%",
            marginTop: 8,
            marginBottom: 16,
            padding: 10,
          }}
        />

        <p style={{ fontSize: 14, marginBottom: 16 }}>
          Password must be 12-128 characters and include uppercase, lowercase,
          number, and symbol.
        </p>

        {confirmPassword && !passwordsMatch && (
          <p style={{ color: "crimson", marginBottom: 16 }}>
            Passwords do not match.
          </p>
        )}

        <button
          onClick={handleChangePassword}
          disabled={loading}
          style={{ padding: "10px 16px" }}
        >
          {loading ? "Updating..." : "Change Password"}
        </button>

        {status && <p style={{ marginTop: 16 }}>{status}</p>}
      </div>
    </div>
  );
}
