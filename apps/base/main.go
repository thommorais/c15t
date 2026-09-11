package main

import (
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/spf13/cobra"

	"thom/api"
	"thom/core/apikey"
	_ "thom/migrations"
)

func main() {
	app := pocketbase.New()

	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: isGoRun,
	})

	app.RootCmd.AddCommand(newAPIKeyCmd(app))

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		cfg := api.DefaultConfig()
		cfg.TenantID = os.Getenv("C15T_TENANT_ID")
		api.Register(app, se, cfg)
		return se.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

func newAPIKeyCmd(app core.App) *cobra.Command {
	var name, env, scope string

	cmd := &cobra.Command{
		Use:   "apikey:create",
		Short: "Create an API key for this instance",
		RunE: func(_ *cobra.Command, _ []string) error {
			keyEnv := apikey.Env(env)
			if keyEnv != apikey.EnvLive && keyEnv != apikey.EnvTest {
				return fmt.Errorf("--env must be live or test")
			}

			keyScope := apikey.Scope(scope)
			if keyScope != apikey.ScopePublishable && keyScope != apikey.ScopeSecret {
				return fmt.Errorf("--scope must be publishable or secret")
			}

			if err := app.Bootstrap(); err != nil {
				return err
			}

			key, err := apikey.Generate(keyEnv, keyScope)
			if err != nil {
				return err
			}

			collection, err := app.FindCollectionByNameOrId("apiKey")
			if err != nil {
				return err
			}

			record := core.NewRecord(collection)
			record.Set("name", name)
			record.Set("keyHash", key.Hash)
			record.Set("env", string(keyEnv))
			record.Set("scope", string(keyScope))
			record.Set("revoked", false)

			if err := app.Save(record); err != nil {
				return err
			}

			fmt.Printf("%s\n", key.Secret)
			return nil
		},
	}

	cmd.Flags().StringVar(&name, "name", "", "key label")
	cmd.Flags().StringVar(&env, "env", "live", "live or test")
	cmd.Flags().StringVar(&scope, "scope", "secret", "publishable or secret")

	return cmd
}
