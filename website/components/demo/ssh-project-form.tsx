"use client";

import { useEffect, useRef, useState } from "react";
import type { NewProjectInput } from "./add-project-modal";
import { BackButton } from "./back-button";
import { NO_AUTOFILL } from "./no-autofill";
import { slugify } from "./project-factory";
import {
  MANUAL_HOST,
  SSH_CONFIG_HOSTS,
  SshHostPicker,
} from "./ssh-host-picker";
import {
  DialogHeader,
  DialogPanel,
  FIELD_CLASS,
  FieldLabel,
  PrimaryButton,
  SecondaryButton,
} from "./ui-kit";

// The app's "Connect to SSH host" dialog: pick a host from ~/.ssh/config and
// its alias, user and port fill in, or enter one by hand. The project name
// follows the host until it is edited.
export function SshProjectForm({
  onBack,
  onClose,
  onCreate,
  focusOnOpen,
}: {
  onBack: () => void;
  onClose: () => void;
  onCreate: (input: NewProjectInput) => void;
  focusOnOpen: boolean;
}) {
  const [picked, setPicked] = useState("");
  const [host, setHost] = useState("");
  const [user, setUser] = useState("");
  const [port, setPort] = useState("");
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const hostRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLButtonElement>(null);

  // The dialog takes the keyboard the way the app's does — the picker on
  // arrival, the Host field once the fields appear — but only for a visitor
  // working it, so the tour's clicks never pull the page's focus into it.
  const [focusHost, setFocusHost] = useState(false);
  const fieldsShown = picked !== "";
  useEffect(() => {
    if (focusOnOpen) pickerRef.current?.focus({ preventScroll: true });
  }, [focusOnOpen]);
  useEffect(() => {
    if (fieldsShown && focusHost) hostRef.current?.focus({ preventScroll: true });
  }, [fieldsShown, focusHost]);

  const pick = (value: string, trusted: boolean) => {
    setPicked(value);
    setFocusHost(trusted);
    const match = SSH_CONFIG_HOSTS.find((h) => h.name === value);
    setHost(match?.name ?? "");
    setUser(match?.user ?? "");
    setPort(match?.port ? String(match.port) : "");
  };

  // Editing the host after picking one leaves the picker saying something the
  // form no longer does, so it falls back to manual entry.
  const editHost = (value: string) => {
    setHost(value);
    if (picked !== MANUAL_HOST) setPicked(MANUAL_HOST);
  };

  const suggested = slugify(user && host ? `${user}-${host}` : user || host);
  const projectName = nameEdited ? name : suggested;
  const ready = projectName.trim() !== "" && host.trim() !== "";

  const submit = () => {
    if (!ready) return;
    onCreate({ kind: "ssh", name: projectName.trim(), host: host.trim() });
  };

  return (
    <DialogPanel
      className="relative max-w-[calc(100%-2rem)]"
      aria-label="Connect to SSH host"
    >
      <BackButton onClick={onBack} />
      <DialogHeader
        title="Connect to SSH host"
        description="Creates a project that connects to a remote host. Services, actions, and terminals will run over this SSH connection."
        onClose={onClose}
      />

      <form
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="mt-4 grid grid-cols-[1fr_120px] gap-3">
          <SshHostPicker
            hosts={SSH_CONFIG_HOSTS}
            picked={picked}
            onPick={pick}
            triggerRef={pickerRef}
          />

          {fieldsShown && (
            <>
              <div className="col-span-2">
                <FieldLabel>Host</FieldLabel>
                <input
                  ref={hostRef}
                  value={host}
                  onChange={(e) => editHost(e.target.value)}
                  placeholder="example.com or 10.0.0.5"
                  {...NO_AUTOFILL}
                  className={FIELD_CLASS}
                />
              </div>

              <div>
                <FieldLabel>User</FieldLabel>
                <input
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="root"
                  {...NO_AUTOFILL}
                  className={FIELD_CLASS}
                />
              </div>

              <div>
                <FieldLabel>Port</FieldLabel>
                <input
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="22"
                  inputMode="numeric"
                  {...NO_AUTOFILL}
                  className={FIELD_CLASS}
                />
              </div>

              <div className="col-span-2">
                <FieldLabel>Project name</FieldLabel>
                <input
                  value={projectName}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameEdited(true);
                  }}
                  placeholder="my-server"
                  {...NO_AUTOFILL}
                  className={FIELD_CLASS}
                />
              </div>
            </>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={!ready} data-tour="ssh-submit">
            Add project
          </PrimaryButton>
        </div>
      </form>
    </DialogPanel>
  );
}
