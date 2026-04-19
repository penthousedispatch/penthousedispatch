import React from 'react';

const PAGE_CONTENT = {
  privacy: {
    title: 'Privacy Policy',
    subtitle: 'How Penthouse Dispatch collects, uses, and protects information.',
    sections: [
      {
        heading: 'Information We Collect',
        body:
          'Penthouse Dispatch collects account information, company profile details, trip and dispatch records, driver onboarding data, rider trip-tracking data, and support requests. Sensitive financial and identity workflows should be completed through secure third-party providers such as Stripe, Plaid, or approved verification services.',
      },
      {
        heading: 'How We Use Information',
        body:
          'We use this information to operate dispatch workflows, support company onboarding, route trips, manage driver and rider experiences, improve reliability, investigate incidents, and provide customer support.',
      },
      {
        heading: 'How We Protect Information',
        body:
          'Penthouse Dispatch uses role-based access, secure authentication, and provider-managed verification or payout services for high-risk data flows. Full Social Security numbers and full bank credentials should not be stored directly in the app when secure external services are available.',
      },
      {
        heading: 'Sharing and Retention',
        body:
          'Information is shared only with authorized company users, platform administrators, connected transportation providers, and approved service vendors required to operate the platform. Records may be retained for dispatch, billing, support, compliance, audit, and dispute-resolution purposes.',
      },
      {
        heading: 'Contact',
        body:
          'For privacy questions, contact support@penthousedps.com.',
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    subtitle: 'Operating terms for Penthouse Dispatch companies, drivers, and riders.',
    sections: [
      {
        heading: 'Platform Use',
        body:
          'Penthouse Dispatch is provided for lawful transportation operations, dispatch coordination, onboarding, rider communication, and related administrative functions. Users must provide accurate information and keep credentials secure.',
      },
      {
        heading: 'Company Responsibilities',
        body:
          'Companies are responsible for reviewing driver and vehicle information, maintaining accurate operational data, following their service agreements, and using secure external providers for regulated identity, tax, payroll, and banking workflows when required.',
      },
      {
        heading: 'Driver and Rider Use',
        body:
          'Drivers and riders must use the app only for authorized trips and support interactions. Misuse, fraud, abuse, or unauthorized access may result in suspension or account removal.',
      },
      {
        heading: 'Availability and Changes',
        body:
          'Features, integrations, and connected services may change over time. Penthouse Dispatch may update workflows, integrations, and policies to improve reliability, security, and compliance.',
      },
      {
        heading: 'Contact',
        body:
          'Questions about these terms can be sent to support@penthousedps.com.',
      },
    ],
  },
  support: {
    title: 'Support',
    subtitle: 'How to get help with Penthouse Dispatch.',
    sections: [
      {
        heading: 'General Support',
        body:
          'For account, onboarding, dispatch, driver, rider, or billing questions, email support@penthousedps.com.',
      },
      {
        heading: 'Company Support',
        body:
          'Company users should include their company name, contact email, and a short summary of the issue. If the issue is urgent, include the trip ID, driver name, or company name when available.',
      },
      {
        heading: 'Technical Support',
        body:
          'For mobile app, web app, login, map, guide audio, payout, or integration issues, include screenshots and the approximate time of the issue so support can investigate more quickly.',
      },
      {
        heading: 'Sentry and Integration Questions',
        body:
          'For provider integration help, include the company name, environment, and whether the issue involves token URL auth, bearer auth, webhook receivers, or provider endpoints.',
      },
    ],
  },
};

export default function PublicInfoPage({ variant = 'privacy' }) {
  const page = PAGE_CONTENT[variant] || PAGE_CONTENT.privacy;

  return (
    <div className="min-h-screen px-4 py-10" style={{ background: '#07090d', color: '#e5e7eb' }}>
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)' }}
          >
            <span style={{ color: '#c9a84c', fontSize: 28, fontWeight: 800 }}>P</span>
          </div>
          <p className="text-sm mb-2" style={{ color: '#c9a84c', fontWeight: 700 }}>PENTHOUSE DISPATCH</p>
          <h1 className="text-3xl font-semibold mb-3">{page.title}</h1>
          <p className="text-sm leading-7" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {page.subtitle}
          </p>
        </div>

        <div className="space-y-4">
          {page.sections.map(section => (
            <section
              key={section.heading}
              className="rounded-2xl p-5"
              style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <h2 className="text-lg font-semibold mb-2" style={{ color: '#c9a84c' }}>
                {section.heading}
              </h2>
              <p className="text-sm leading-7" style={{ color: 'rgba(255,255,255,0.68)' }}>
                {section.body}
              </p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
