import { registry } from "@/connectors";

export default function Home() {
  return (
    <main>
      <h1>K4 Connect</h1>
      <p>Turning useful data into useful conversations.</p>
      <ul>
        {registry.list().map((connector) => (
          <li key={connector.manifest.id}>
            {connector.manifest.name}: {connector.manifest.description}
          </li>
        ))}
      </ul>
    </main>
  );
}
