import { Link } from 'react-router-dom';

export function HelpPage() {
  return (
    <main className="onboarding-layout">
      <div className="onboarding-container">
        <header className="onboarding-header">
          <p className="eyebrow">Help center</p>
          <h1>How can we help?</h1>

          <p className="auth-description">
            Learn how to create and share your
            professional freelance portfolio.
          </p>
        </header>

        <section className="onboarding-card">
          <h2>Getting started</h2>

          <p>
            Start by setting up your freelancer profile,
            choosing a public username, and adding your
            professional introduction.
          </p>

          <Link
            className="primary-button"
            to="/onboarding"
          >
            Set up profile
          </Link>
        </section>

        <section
          className="onboarding-card"
          style={{ marginTop: 20 }}
        >
          <h2>Projects and skills</h2>

          <p>
            Add projects that demonstrate your work and
            professional skills. Organize the content
            before publishing your profile.
          </p>

          <Link
            className="secondary-button"
            to="/portfolio"
          >
            Open portfolio manager
          </Link>
        </section>

        <section
          className="onboarding-card"
          style={{ marginTop: 20 }}
        >
          <h2>Publishing and sharing</h2>

          <p>
            When your profile is complete, validate and
            publish it. You can then share your public
            portfolio link with clients.
          </p>

          <p>
            Visitors do not need an account to view your
            published portfolio.
          </p>

          <Link
            className="secondary-button"
            to="/profile"
          >
            Manage publication
          </Link>
        </section>
      </div>
    </main>
  );
}
