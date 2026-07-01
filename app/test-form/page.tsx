export default function TestFormPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 py-8">
      <div>
        <p className="text-sm uppercase tracking-[0.22em] text-slate-500">Regression Form</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-slate-950">Answer-resilience test page</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Open this in the application window to verify structured field mapping, sponsorship polarity, salary matching, safe resume upload, and the default review behavior for sensitive prompts.
        </p>
      </div>

      <form className="space-y-5 rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <section className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">1. Basic contact fields</p>
            <p className="mt-1 text-sm text-slate-500">Expected: identity fields fill normally, and only the true email field gets the saved email.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="first_name" className="field-label">First Name</label>
              <input id="first_name" name="first_name" className="field-input mt-2" />
            </div>
            <div>
              <label htmlFor="last_name" className="field-label">Last Name</label>
              <input id="last_name" name="last_name" className="field-input mt-2" />
            </div>
            <div>
              <label htmlFor="email" className="field-label">Email</label>
              <input id="email" name="email" type="email" className="field-input mt-2" />
            </div>
            <div>
              <label htmlFor="phone" className="field-label">Phone</label>
              <input id="phone" name="phone" type="tel" className="field-input mt-2" />
            </div>
            <div>
              <label htmlFor="linkedin" className="field-label">LinkedIn Profile</label>
              <input id="linkedin" name="linkedin" type="url" className="field-input mt-2" />
            </div>
            <div>
              <label htmlFor="github" className="field-label">GitHub</label>
              <input id="github" name="github" type="url" className="field-input mt-2" />
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50/60 p-5">
          <div>
            <p className="text-sm font-semibold text-slate-900">2. Authorization and sponsorship</p>
            <p className="mt-1 text-sm text-slate-500">Expected: authorization matches the positive option, sponsorship honors profile values, and polarity is handled correctly.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="work_authorization" className="field-label">Are you authorized to work in the United States?</label>
              <select id="work_authorization" name="work_authorization" className="field-input mt-2">
                <option value="">Select</option>
                <option>Yes</option>
                <option>No</option>
              </select>
            </div>
            <div>
              <label htmlFor="sponsorship" className="field-label">Will you now or in the future require sponsorship?</label>
              <select id="sponsorship" name="sponsorship" className="field-input mt-2">
                <option value="">Select</option>
                <option>Yes</option>
                <option>No</option>
              </select>
            </div>
            <div>
              <label htmlFor="without_sponsorship" className="field-label">Can you work without visa sponsorship?</label>
              <select id="without_sponsorship" name="without_sponsorship" className="field-input mt-2">
                <option value="">Select</option>
                <option>Yes</option>
                <option>No</option>
              </select>
            </div>
            <div>
              <label htmlFor="authorization_variant" className="field-label">Current employment authorization status</label>
              <select id="authorization_variant" name="authorization_variant" className="field-input mt-2">
                <option value="">Select</option>
                <option>I am legally authorized to work in the United States</option>
                <option>I am not currently authorized to work in the United States</option>
              </select>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">3. Compensation and availability</p>
            <p className="mt-1 text-sm text-slate-500">Expected: salary range selects the best matching option, numeric salary stays numeric, and start timing uses the compatible value.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="salary_range" className="field-label">Desired salary range</label>
              <select id="salary_range" name="salary_range" className="field-input mt-2">
                <option value="">Select</option>
                <option>$70,000 - $80,000</option>
                <option>$80,000 - $90,000</option>
                <option>$90,000 - $100,000</option>
                <option>$100,000+</option>
              </select>
            </div>
            <div>
              <label htmlFor="salary_numeric" className="field-label">Desired salary (numbers only)</label>
              <input id="salary_numeric" name="salary_numeric" type="number" className="field-input mt-2" />
            </div>
            <div>
              <label htmlFor="availability" className="field-label">When can you start?</label>
              <select id="availability" name="availability" className="field-input mt-2">
                <option value="">Select</option>
                <option>Immediately</option>
                <option>1 week</option>
                <option>2 weeks</option>
                <option>3 weeks</option>
                <option>1 month</option>
              </select>
            </div>
            <div>
              <label htmlFor="availability_date" className="field-label">If a specific start date is required</label>
              <input id="availability_date" name="availability_date" type="date" className="field-input mt-2" />
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50/60 p-5">
          <div>
            <p className="text-sm font-semibold text-slate-900">4. Resume and narrative questions</p>
            <p className="mt-1 text-sm text-slate-500">Expected: stored resume uploads automatically, while open-ended questions rely on saved answers or review.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="resume" className="field-label">Resume</label>
              <input id="resume" name="resume" type="file" className="field-input mt-2 pt-2.5" />
            </div>
            <div>
              <label htmlFor="cover_letter" className="field-label">Cover Letter</label>
              <input id="cover_letter" name="cover_letter" type="file" className="field-input mt-2 pt-2.5" />
            </div>
          </div>
          <div>
            <label htmlFor="why_interested" className="field-label">Why are you interested in this role?</label>
            <textarea id="why_interested" name="why_interested" className="subtle-textarea mt-2" />
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">5. Sensitive defaults</p>
            <p className="mt-1 text-sm text-slate-500">Expected: these stay in review by default unless you explicitly configured them for reuse.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="gender" className="field-label">Gender</label>
              <select id="gender" name="gender" className="field-input mt-2">
                <option value="">Select</option>
                <option>Male</option>
                <option>Female</option>
                <option>Non-binary</option>
                <option>I do not wish to answer</option>
              </select>
            </div>
            <div>
              <label htmlFor="race_ethnicity" className="field-label">Race / Ethnicity</label>
              <select id="race_ethnicity" name="race_ethnicity" className="field-input mt-2">
                <option value="">Select</option>
                <option>Asian</option>
                <option>Black or African American</option>
                <option>Hispanic or Latino</option>
                <option>White</option>
                <option>I do not wish to answer</option>
              </select>
            </div>
            <div>
              <label htmlFor="veteran_status" className="field-label">Veteran Status</label>
              <select id="veteran_status" name="veteran_status" className="field-input mt-2">
                <option value="">Select</option>
                <option>I am not a protected veteran</option>
                <option>I identify as one or more protected veteran classifications</option>
                <option>I do not wish to answer</option>
              </select>
            </div>
            <div>
              <label htmlFor="disability_status" className="field-label">Disability Status</label>
              <select id="disability_status" name="disability_status" className="field-input mt-2">
                <option value="">Select</option>
                <option>Yes, I have a disability</option>
                <option>No, I do not have a disability</option>
                <option>I do not wish to answer</option>
              </select>
            </div>
          </div>
        </section>
      </form>
    </div>
  );
}
