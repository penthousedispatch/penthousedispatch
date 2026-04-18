import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getAuthRedirectUrl } from "../lib/mobileRuntime";

export default function ChangeMyPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [forceChangeMode, setForceChangeMode] = useState(false);

  const passwordValid =
    newPassword.length >= 12 &&
    newPassword.length <= 128 &&
    /[A-Z]/.test(newPassword) &&
    /[a-z]/.test(newPassword) &&
    /[0-9]/.test(newPassword) &&
    /[^A-Za-z0-9]/.test(newPassword);

  const passwordsMatch = newPassword === confirmPassword;

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      setHasSession(Boolean(session));
      if (session?.user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('require_password_change')
          .eq('id', session.user.id)
          .maybeSingle();

        if (mounted) {
          setForceChangeMode(Boolean(profile?.require_password_change));
        }
      }
      setCheckingSession(false);
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        sessionStorage.setItem("pd_password_recovery", "true");
        setHasSession(Boolean(session));
        setStatus("");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function sendResetLink() {
    setStatus("");

    if (!email.trim()) {
      setStatus("Enter your email address first.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getAuthRedirectUrl('/change-password'),
      });

      setStatus(
        error
          ? error.message
          : "Password reset email sent. Open the link in that email, then come back here."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword() {
    setStatus("");

    if (!hasSession) {
      setStatus("Open the password reset link from your email first.");
      return;
    }

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

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setStatus(error.message);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.id) {
        await supabase
          .from('profiles')
          .update({ require_password_change: false })
          .eq('id', user.id);
      }

      sessionStorage.removeItem("pd_password_recovery");
      setForceChangeMode(false);
      setStatus("Your password was updated successfully. Taking you back into the app...");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => navigate("/"), 1200);
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
        Back to Login
      </button>

      <h1>Reset Password</h1>

      <p style={{ marginTop: 8 }}>
        {forceChangeMode
          ? "This account is using a temporary password. Choose a new password now before continuing."
          : "Enter your email to receive a reset link. After you open that email link, come back here and choose your new password."}
      </p>

      <div style={{ marginTop: 20 }}>
        <label htmlFor="reset-email">Email Address</label>
        <input
          id="reset-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          style={{
            display: "block",
            width: "100%",
            marginTop: 8,
            marginBottom: 16,
            padding: 10,
          }}
        />

        {!forceChangeMode && (
          <button
            onClick={sendResetLink}
            disabled={loading}
            style={{ padding: "10px 16px", marginBottom: 20 }}
          >
            {loading ? "Sending..." : "Send Password Reset Email"}
          </button>
        )}

        <h2 style={{ marginBottom: 8 }}>Choose New Password</h2>

        {checkingSession ? (
          <p style={{ marginBottom: 16 }}>Checking reset link...</p>
        ) : !hasSession ? (
          <p style={{ marginBottom: 16 }}>
            {forceChangeMode
              ? "Sign in with the temporary password first, then set a permanent one here."
              : "No active reset session yet. Open the password reset link from your email first."}
          </p>
        ) : (
          <p style={{ marginBottom: 16, color: "green" }}>
            {forceChangeMode
              ? "Temporary password accepted. Set a permanent password now."
              : "Reset link confirmed. You can set a new password now."}
          </p>
        )}

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
          disabled={loading || !hasSession}
          style={{ padding: "10px 16px" }}
        >
          {loading ? "Updating..." : "Update Password"}
        </button>

        {status && <p style={{ marginTop: 16 }}>{status}</p>}
      </div>
    </div>
  );
}
