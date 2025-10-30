import { FC, useState } from "react";
import { useRecoilState } from "recoil";
import { Menu } from "@headlessui/react";
import { useRouter } from "next/router";
import { IconLogout, IconSettings } from "@tabler/icons-react";
import axios from "axios";
import { loginState } from "@/state";

const Topbar: FC = () => {
	const [login, setLogin] = useRecoilState(loginState);
	const [isLoggingOut, setIsLoggingOut] = useState(false);
	const router = useRouter();

	async function logout() {
		try {
			setIsLoggingOut(true);
			await axios.post("/api/auth/logout");

			setLogin({
				userId: 0,
				username: "",
				displayname: "",
				canMakeWorkspace: false,
				thumbnail: "",
				workspaces: [],
			});

			router.push("/login");
		} catch (err) {
			console.error("Logout failed:", err);
		} finally {
			setIsLoggingOut(false);
		}
	}

	return (
		<div className="z-10 h-12 fixed top-0 left-0 w-full rounded-b-xl bg-white dark:bg-gray-900 drop-shadow flex items-center justify-between px-8 sm:px-16 md:px-32 lg:px-48">
			{/* Left - Logo */}
			<a
				onClick={() => router.push("/")}
				className="flex flex-row items-center rounded-xl px-2 py-1 hover:bg-gray-200 dark:hover:bg-gray-800 transition cursor-pointer select-none"
			>
				<img
					src="/Icon_Transparent.svg"
					alt="Tovy logo"
					className="h-8 w-8 rounded-full"
					draggable="false"
				/>
				<p className="ml-2 text-md font-medium">Tovy</p>
			</a>

			{/* Right - User Menu */}
			<Menu as="div" className="relative inline-block text-left">
				<Menu.Button className="flex flex-row items-center rounded-xl px-2 py-1 hover:bg-gray-200 dark:hover:bg-gray-800 transition cursor-pointer select-none">
					<img
						src={login?.thumbnail || "/placeholder-avatar.png"}
						alt="User avatar"
						className="h-8 w-8 rounded-full bg-gray-400"
					/>
					<p className="ml-2 text-md font-medium">{login?.displayname || "User"}</p>
				</Menu.Button>

				<Menu.Items className="absolute right-0 z-20 mt-2 w-56 origin-top-right rounded-xl bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 focus-visible:outline-none">
					<div className="py-1">
						{/* Signed-in info */}
						<Menu.Item>
							<a className="flex flex-row px-4 py-2 text-sm cursor-default select-none">
								<img
									src={login?.thumbnail || "/placeholder-avatar.png"}
									className="h-8 w-8 rounded-full bg-gray-400 my-auto"
									alt="User avatar"
								/>
								<div className="ml-2">
									<p className="text-xs text-gray-400">Signed in as</p>
									<span className="font-medium text-gray-700 dark:text-gray-200">
										{login.username || "Unknown"}
									</span>
								</div>
							</a>
						</Menu.Item>

						<div className="h-px bg-gray-200 dark:bg-gray-700 my-1" />

						{/* Account settings */}
						<Menu.Item>
							{({ active }) => (
								<a
									onClick={() => router.push("/settings")}
									className={`${active
										? "bg-tovybg text-white"
										: "text-gray-700 dark:text-white"
										} px-3 py-2 text-sm rounded-xl m-1 font-medium flex flex-row cursor-pointer transition-colors`}
								>
									<IconSettings size={20} className="inline-block" />
									<p className="ml-2">Account settings</p>
								</a>
							)}
						</Menu.Item>

						{/* Logout */}
						<Menu.Item>
							{({ active }) => (
								<a
									onClick={logout}
									className={`${active
										? "bg-tovybg text-white"
										: "text-gray-700 dark:text-white"
										} px-3 py-2 text-sm rounded-xl m-1 font-medium flex flex-row cursor-pointer transition-colors ${isLoggingOut ? "opacity-60 cursor-not-allowed" : ""}`}
								>
									<IconLogout size={20} className="inline-block" />
									<p className="ml-2">{isLoggingOut ? "Logging out..." : "Logout"}</p>
								</a>
							)}
						</Menu.Item>
					</div>
				</Menu.Items>
			</Menu>
		</div>
	);
};

export default Topbar;
